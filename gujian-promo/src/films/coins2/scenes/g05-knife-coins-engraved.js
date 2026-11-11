// g05 — 刀币线刻: a black-and-white copperplate. Knife coins laid head to tail along the strokes of the CURRENT GLYPH, on a
// machine-ruled tablet cut to the glyph's outline. Each knife is engraved as a solid thing: a raised rim that shades its own
// field, a rounded face whose lines swell in the shade and break in the light, a side wall in full shadow and a shadow thrown to
// the lower right. Fine ruled hatching on cream paper; no lettering anywhere. Nothing here knows which character it spells:
// the knives follow centre lines traced through the glyph's distance field, and every size follows K.glyphInfo().strokeWidth.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const INK = '#1b1814';
const LD = [0.7071, 0.7071];                                     // the way the light travels (from the top-left)
let layer = null;

/** knife outline in (u, v): u runs along the length from the point (0) to the ring end (Lk); v across, from the back (0) to the edge (W) */
function profile(Lk, W, k, r) {
  const Wh = W * r.range(0.5, 0.56), rr = Wh * 0.7, ri = rr * 0.5;
  const ub = Lk * r.range(0.56, 0.62), uh = Lk - 2 * rr + (rr - ri) * 0.7;
  const sl = W * r.range(0.4, 0.55), Wj = W * 0.9, bow = W * 0.06, st = Math.max(2, Math.min(6, 5 * k));
  const tail = [[ub + 4 * k, Wh], [ub, Wh + 2.5 * k], [ub - 5 * k, Wj - 3 * k], [ub - 10 * k, Wj]];           // the shoulder where blade meets handle
  const e0 = ub - 10 * k;
  for (let u = e0 - st; u > sl; u -= st) { const t = (e0 - u) / (e0 - sl); tail.push([u, L.lerp(Wj, W, t) - bow * Math.sin(Math.PI * t)]); }
  tail.push([sl, W]);
  for (let j = 1; j < 6; j++) { const t = j / 6; tail.push([sl * (1 - t) + Math.sin(Math.PI * t) * 2.5 * k, W * (1 - t)]); }   // the slanting, slightly hollow end
  const body = [];
  for (let u = 0; u < uh; u += st) body.push([u, 0]);
  body.push([uh, 0], [uh, Wh]);
  for (let u = uh - st; u > ub + 4 * k; u -= st) body.push([u, Wh]);
  body.push(...tail);
  const rc = [Lk - rr, Wh / 2], ro = [], rin = [];
  for (let j = 0; j < 40; j++) { const a = (j / 40) * TAU; ro.push([rc[0] + Math.cos(a) * rr, rc[1] + Math.sin(a) * rr]); }
  for (let j = 40; j > 0; j--) { const a = (j / 40) * TAU; rin.push([rc[0] + Math.cos(a) * ri, rc[1] + Math.sin(a) * ri]); }
  // the silhouette as ONE loop (handle running into the ring), for the shadow lines
  const hx = Math.sqrt(rr * rr - (Wh * Wh) / 4), ui = rc[0] - hx, A = Math.atan2(Wh / 2, -hx), sil = [];
  for (let u = 0; u < ui; u += st) sil.push([u, 0]);
  for (let j = 0; j <= 36; j++) { const a = -A + (2 * A * j) / 36; sil.push([rc[0] + Math.cos(a) * rr, rc[1] + Math.sin(a) * rr]); }
  for (let u = ui - st; u > ub + 4 * k; u -= st) sil.push([u, Wh]);
  sil.push(...tail);
  return { body, ro, rin, sil, Wh, rr, ri, ub, uh, sl, Wj, rc };
}

function knife(M, Lk, W, seed) {
  const r = L.rng(seed), k = W / 56, P = profile(Lk, W, k, r);
  const map = (sh) => sh.map(([u, v]) => M(u, v));
  return { M, Lk, W, k, kw: L.clamp(k, 0.62, 1.2), P, r, shapes: [P.body, P.ro, P.rin].map(map), outer: [P.sil, P.rin].map(map) };
}
function trace(g, kn, dx = 0, dy = 0, shapes = kn.shapes) {
  g.beginPath();
  for (const sh of shapes) { sh.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); g.closePath(); }
}

const SHADE = [[0.074, 1.5], [0.098, 1.25], [0.123, 1.0], [0.149, 0.78], [0.177, 0.58], [0.207, 0.4]];   // [offset down the light / W, line width]
/** the shadow each knife throws to the lower right: its own outline repeated down the light, heavy close under it and thinning away */
function castShadow(g, kn) {
  const { W, kw } = kn;
  g.save(); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
  SHADE.forEach(([o, lw]) => { g.lineWidth = lw * kw; trace(g, kn, o * W * 0.8, o * W, kn.outer); g.stroke(); });
  g.restore();
}

function drawKnife(g, kn, nz) {
  const { M, Lk, W, P, r, k, kw } = kn;
  // the eye of the ring shows plain ruled ground in the ring's own shadow, whatever lies under it (no stray fragments in the hole)
  const eye = [kn.shapes[2]];
  let ex0 = 1e9, ey0 = 1e9, ex1 = -1e9, ey1 = -1e9;
  for (const [x, y] of eye[0]) { ex0 = Math.min(ex0, x); ey0 = Math.min(ey0, y); ex1 = Math.max(ex1, x); ey1 = Math.max(ey1, y); }
  g.save(); trace(g, kn, 0, 0, eye); g.clip();
  g.globalCompositeOperation = 'destination-out'; g.fillRect(ex0 - 2, ey0 - 2, ex1 - ex0 + 4, ey1 - ey0 + 4);
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineWidth = 0.7 * kw;
  for (let y = ey0 + 1; y < ey1; y += Math.max(1.8, 2.4 * kw)) { g.beginPath(); g.moveTo(ex0 - 1, y); g.lineTo(ex1 + 1, y); g.stroke(); }
  SHADE.slice(0, 4).forEach(([o, lw]) => { g.lineWidth = lw * kw; trace(g, kn, o * W * 0.8, o * W, eye); g.stroke(); });
  g.restore();
  // the knife's thickness: its side wall, in full shadow on the sides turned away from the light
  g.fillStyle = INK; trace(g, kn, 2.1 * k + 0.5, 2.7 * k + 0.6); g.fill();
  // bare paper under the knife
  g.save(); g.globalCompositeOperation = 'destination-out'; trace(g, kn); g.fill(); g.restore();
  g.save(); trace(g, kn); g.clip();
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round';
  const shade = (u, v, x, y) => {
    const Wl = u < P.ub ? W : P.Wh, c = L.clamp((2 * v) / Wl - 1, -1.2, 1.2), a = M(u, v), b = M(u, v + 1), e = M(u + 1, v);
    const d = (b[0] - a[0]) * LD[0] + (b[1] - a[1]) * LD[1];        // > 0 where "across the knife" points away from the light
    const al = (e[0] - a[0]) * LD[0] + (e[1] - a[1]) * LD[1], sg = d > 0 ? 1 : -1, ad = Math.min(1, Math.abs(d) * 1.6);
    const core = Math.exp(-((c + 0.5 * sg) * (c + 0.5 * sg)) / 0.07) * ad;                 // the bright core of the highlight
    const refl = L.clamp((c * sg - 0.7) / 0.3) * ad;                                       // light thrown back into the far side by the rim
    return 0.47 + 0.44 * d * c - 0.34 * core - 0.26 * refl + 0.13 * al * ((2 * u) / Lk - 1)
      + 0.36 * nz.fbm(x * 0.012, y * 0.012, 3) + 0.2 * nz.fbm(x * 0.05 + 9, y * 0.05, 2) + (u > P.ub ? 0.07 : 0);
  };
  // 1) lines engraved along the length, swelling in the shade and breaking in the lights
  const du = L.clamp(5 * k, 2.5, 6), pitch = L.clamp(2.6 * k, 1.7, 2.9);
  for (let v = -9 * k + r() * 1.2; v < W + 3 * k; v += pitch) {
    let p0 = M(0, v);
    for (let u = du; u <= Lk + 0.5; u += du) {
      const p1 = M(u, v + Math.sin(u * 0.045 + v) * 0.22), sh = shade(u - du / 2, v, p1[0], p1[1]);
      const w = (0.4 + 1.55 * L.clamp(sh, 0, 1)) * kw;
      if (sh > 0.1) { g.lineWidth = w; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
      p0 = p1;
    }
  }
  // 2) cross-hatching laid over the darkest passages
  const cp = L.clamp(3.4 * k, 2.1, 3.7), cv = L.clamp(3.5 * k, 2, 4);
  for (let c = -W; c < Lk + W; c += cp) {
    let p0 = null;
    for (let v = -9 * k; v <= W + 3 * k; v += cv) {
      const u = c + v * 0.9; if (u < 0 || u > Lk) { p0 = null; continue; }
      const p1 = M(u, v), sh = shade(u, v, p1[0], p1[1]);
      if (p0 && sh > 0.6) { g.lineWidth = Math.min(1.25, 0.35 + (sh - 0.6) * 3.2) * kw; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
      p0 = p1;
    }
  }
  // 3) patina: burin flicks and the odd dot (no pits)
  for (let j = 0, n = Math.round(r.range(24, 36) * Math.min(1.5, (Lk * W) / 13000)); j < n; j++) {
    const u = r.range(8 * k, Lk - 8 * k), v = r.range(4 * k, (u < P.ub ? W : P.Wh) - 4 * k), [x, y] = M(u, v);
    if (r() < 0.22) { g.beginPath(); g.arc(x, y, r.range(0.45, 0.9) * kw, 0, TAU); g.fill(); continue; }
    const a = r.range(0, TAU), len = r.range(2, 5.5) * kw;
    g.lineWidth = r.range(0.8, 1.4) * kw;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  //    … and scratches where handling has rubbed the lines away
  g.globalCompositeOperation = 'destination-out';
  for (let j = 0, n = r.int(3, 6); j < n; j++) {
    const u0 = r.range(0.04, 0.78) * Lk, len = r.range(0.07, 0.2) * Lk, v0 = r.range(0.16, 0.84), dv = r.range(-0.14, 0.14);
    g.lineWidth = r.range(0.7, 1.25) * kw; g.globalAlpha = r.range(0.6, 1);
    g.beginPath();
    for (let s = 0; s <= 6; s++) { const u = u0 + (len * s) / 6, [x, y] = M(u, (v0 + (dv * s) / 6) * (u < P.ub ? W : P.Wh)); s ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // 4) the two raised lines down the handle: a clean light ridge with a dark line on its shaded side
  for (const f of [0.36, 0.66]) {
    const pts = []; for (let u = P.ub + 7 * k; u <= P.uh - 1; u += du) pts.push(M(u, P.Wh * f));
    if (pts.length < 2) continue;
    const run = (dx, dy) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); g.stroke(); };
    g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3.4 * k; run(0, 0);
    g.globalCompositeOperation = 'source-over'; g.lineWidth = 1.15 * kw; run(1.3 * k, 1.3 * k);
  }
  // 5) the raised rim all round: a band of bare paper inside the outline, closed by an inner line — which is the rim's own
  //    shadow on the field, so it is heavy on the sides toward the light and a hair on the others
  g.lineJoin = 'round';
  trace(g, kn, 1.9 * k, 2.3 * k); g.lineWidth = 11 * k; g.stroke();
  trace(g, kn); g.lineWidth = 11 * k; g.stroke();
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 8.6 * k; g.stroke();
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // outline, with a heavier "shadow line" on the sides turned away from the light
  g.save(); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = 1.5 * kw; trace(g, kn, 0.8 * kw, 0.9 * kw); g.stroke();
  g.lineWidth = 1.3 * kw; trace(g, kn); g.stroke();
  g.restore();
}

/**
 * Where the knives go. Centre lines are walked through the glyph's distance field (K.sdGlyph / K.glyphNormal keep the walker on
 * the ridge of the stroke, K.strokeAngle steers it), starting from the beads K.pack strings along the strokes, longest runs
 * first. Each run is cut into knives laid head to tail; a run that meets another stroke at an angle simply lies across it.
 */
function layout(info, tag) {
  const SW = info.strokeWidth, r = L.rng('g05lay' + info.key);
  const depth = (x, y) => -K.sdGlyph(x, y);
  const DS = Math.max(2, SW * 0.05), CELL = 3, GN = Math.ceil(S / CELL) + 1;
  const occ = new Uint8Array(GN * GN), own = new Int32Array(GN * GN);
  const cellOf = (x, y) => L.clamp((y / CELL) | 0, 0, GN - 1) * GN + L.clamp((x / CELL) | 0, 0, GN - 1);
  const dStop = Math.max(2.5, SW * 0.17), angR = Math.max(16, SW * 0.8), OVER = Math.round((SW * 0.5) / DS);
  const angleAt = (x, y, d) => K.strokeAngle(x, y, Math.max(angR, 2.3 * d));      // look far enough to see the stroke's length, however fat it is
  let ids = 0;

  const step = (st) => {                        // one step along the stroke; false where the stroke runs out
    const dx = st.dx, dy = st.dy; let nx = st.x + dx * DS, ny = st.y + dy * DS, d = depth(nx, ny);
    for (let j = 0; j < 2; j++) {               // slide ACROSS the stroke onto its centre line (never along it)
      const n = K.glyphNormal(nx, ny, 2), c = n.x * dy - n.y * dx;
      if (Math.abs(c) < 0.15) break;
      const sg = c > 0 ? 0.9 : -0.9, qx = nx - dy * sg, qy = ny + dx * sg, d2 = depth(qx, qy);
      if (d2 <= d) break;
      nx = qx; ny = qy; d = d2;
    }
    if (d < dStop || nx < 6 || ny < 6 || nx > S - 6 || ny > S - 6) return false;
    st.x = nx; st.y = ny; st.d = d; st.dref += (d - st.dref) * 0.1;
    if (d > 0.72 * st.dref) {                   // (in the stroke's rounded end there is nothing left to steer by)
      const a = angleAt(nx, ny, d); let vx = Math.cos(a), vy = Math.sin(a), dot = vx * dx + vy * dy;
      if (dot < 0) { vx = -vx; vy = -vy; dot = -dot; }
      if (dot > 0.87) { const ex = dx * 0.7 + vx * 0.3, ey = dy * 0.7 + vy * 0.3, l = Math.hypot(ex, ey); st.dx = ex / l; st.dy = ey / l; }   // else: a junction — carry straight on
    }
    return true;
  };
  const half = (x0, y0, a0, sgn, useOcc, id, other) => {
    const pts = [], st = { x: x0, y: y0, dx: Math.cos(a0) * sgn, dy: Math.sin(a0) * sgn, d: 0, dref: depth(x0, y0) }; let over = 0;
    for (let n = 0; n < 480; n++) {
      if (!step(st)) break;
      const x = st.x, y = st.y;
      if (useOcc) {                             // a knife already lies along this stroke: run on a little to butt against it, then stop
        const o = occ[cellOf(x, y)];
        if (o) { const oa = ((o - 1) * Math.PI) / 126; if (Math.abs(Math.cos(oa) * st.dx + Math.sin(oa) * st.dy) > 0.74 && ++over > OVER) break; }
      }
      const ci = (x / CELL) | 0, cj = (y / CELL) | 0; let loop = false;
      for (let j = -2; j <= 2 && !loop; j++) for (let i = -2; i <= 2; i++) {      // back on its own trail (a closed stroke)?
        const cx = ci + i, cy = cj + j; if (cx < 0 || cy < 0 || cx >= GN || cy >= GN) continue;
        const o = own[cy * GN + cx], oid = o >> 10, on = o & 1023;
        if ((oid === id && n - on > 14) || (oid === other && on > 14)) { loop = true; break; }
      }
      if (loop) break;
      own[cj * GN + ci] = (id << 10) | n;
      pts.push([x, y, st.d]);
    }
    return pts;
  };
  const walk = (x0, y0, useOcc) => {
    const d0 = depth(x0, y0), a0 = angleAt(x0, y0, d0);
    const ia = ++ids, a = half(x0, y0, a0, -1, useOcc, ia, -1), ib = ++ids, b = half(x0, y0, a0, 1, useOcc, ib, ia);
    return a.reverse().concat([[x0, y0, d0]], b);
  };
  const mark = (x, y, rad, th) => {
    let a = th % Math.PI; if (a < 0) a += Math.PI;
    const code = 1 + Math.round((a / Math.PI) * 126), n = Math.ceil(rad / CELL), ci = (x / CELL) | 0, cj = (y / CELL) | 0;
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const cx = ci + i, cy = cj + j; if (cx < 0 || cy < 0 || cx >= GN || cy >= GN || (i * i + j * j) * CELL * CELL > rad * rad) continue;
      occ[cy * GN + cx] = code;
    }
  };

  const seeds = K.pack({ seed: 'g05', rmax: SW * 0.5, rmin: Math.max(4, SW * 0.22), gap: 1 });
  for (const s of seeds) s.len = walk(s.x, s.y, false).length;
  seeds.sort((a, b) => (b.len - a.len) || (a.i - b.i));

  const out = [], Wmin = SW * 0.36, Wcap = SW * 1.2, ASP = 3;
  for (const sd of seeds) {
    if (occ[cellOf(sd.x, sd.y)]) continue;
    let run = walk(sd.x, sd.y, true);
    if (run.length < 8) continue;
    for (let pass = 0; pass < 2; pass++) {      // take the walker's tremble out
      const o = run.map((p) => p.slice());
      for (let i = 2; i < run.length - 2; i++) for (let c = 0; c < 2; c++) run[i][c] = (o[i - 2][c] + 2 * o[i - 1][c] + 3 * o[i][c] + 2 * o[i + 1][c] + o[i + 2][c]) / 9;
    }
    const ds = run.map((p) => p[2]).sort((a, b) => a - b), core = ds.filter((d) => d >= 0.6 * ds[ds.length >> 1]);
    const Wr = Math.min(Wcap, 0.8 * 2 * core[Math.floor(core.length * 0.3)]);   // blade ≈ 0.8 × the stroke it lies in
    if (Wr < Wmin) continue;
    let i0 = 0, i1 = run.length - 1;
    while (i0 < i1 && run[i0][2] < 0.3 * Wr) i0++;
    while (i1 > i0 && run[i1][2] < 0.3 * Wr) i1--;
    run = run.slice(i0, i1 + 1);
    const n = run.length; if (n < 8) continue;
    const th = new Float32Array(n), cum = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = run[Math.max(0, i - 4)], b = run[Math.min(n - 1, i + 4)]; th[i] = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    for (let i = 1; i < n; i++) {
      let d = th[i] - th[i - 1]; while (d > Math.PI) { th[i] -= TAU; d -= TAU; } while (d < -Math.PI) { th[i] += TAU; d += TAU; }
      cum[i] = cum[i - 1] + Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
    }
    if (cum[n - 1] < ASP * Math.max(Wmin, 0.55 * Wr)) continue;                  // too short for any knife: leave it to the tablet
    const cov = new Uint8Array(n); for (let i = 0; i < n; i++) cov[i] = occ[cellOf(run[i][0], run[i][1])] ? 1 : 0;      // where it lies across knives already down
    for (let i = 0; i < n; i++) mark(run[i][0], run[i][1], Wr * 0.5, th[i]);
    // a knife does not go round a corner: cut the run where the stroke turns sharply
    const w = Math.max(2, Math.round((SW * 0.5) / DS)), turn = (i) => Math.abs(th[Math.min(n - 1, i + w)] - th[Math.max(0, i - w)]);
    const cuts = [0];
    for (let i = w; i < n - w; i++) {
      const t = turn(i); if (t < 0.9) continue;
      let peak = true; for (let j = -w; j <= w && peak; j++) if (turn(i + j) > t || (j < 0 && turn(i + j) === t)) peak = false;
      if (peak) cuts.push(i);
    }
    cuts.push(n - 1);
    const avg = (a, b) => { let s = 0; for (let i = a; i <= b; i++) s += run[i][2]; return s / (b - a + 1); };
    const m4 = Math.min(4, n - 1), dA = avg(0, m4), dB = avg(n - 1 - m4, n - 1), hf = Math.max(1, Math.round(n * 0.45)), hA = avg(0, hf - 1), hB = avg(n - hf, n - 1);
    // the blade lies where the stroke is fatter (in a junction, or at the heavy end of a dot); the ring goes to the thin or free end
    const lean = (dA - dB) / Math.max(dA, dB) + (2 * (hA - hB)) / Math.max(hA, hB);
    const flip = Math.abs(lean) < 0.08 ? r() < 0.5 : lean < 0;
    const side = r() < 0.5 ? 1 : -1, back = Math.round((0.28 * Wr) / DS);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const a = cuts[c] + (c > 0 ? back : 0), b = cuts[c + 1] - (c + 2 < cuts.length ? back : 0);      // (stand back from a corner so the two ends just meet)
      if (b - a < 6) continue;
      const len = cum[b] - cum[a];
      let W = Wr, tsum = 0; for (let i = a; i + w <= b; i += w) tsum += Math.abs(th[i + w] - th[i]);
      let m = Math.max(1, Math.round(len / (4.4 * W)), Math.round(tsum / 0.9));
      if (len / m < ASP * W) m = Math.max(1, Math.floor(len / (ASP * W)));
      if (len < ASP * W) { W = len / ASP; if (W < Math.max(Wmin, 0.55 * Wr)) continue; }
      for (let j = 0; j < m; j++) {
        let ia = a + Math.round(((b - a) * j) / m), ib = a + Math.round(((b - a) * (j + 1)) / m);
        // this knife's own width: 0.8 × the stroke where IT lies; and at a free end of the stroke it stops where it still fits
        const sp = []; for (let i = ia; i <= ib; i++) sp.push(run[i][2]); sp.sort((p, q) => p - q);
        let Wj = Math.min(W, 0.8 * 2 * sp[Math.floor(sp.length * 0.3)]);
        if (ia === 0) while (ia < ib - 6 && run[ia][2] < 0.5 * Wj - 5) ia++;
        if (ib === n - 1) while (ib > ia + 6 && run[ib][2] < 0.5 * Wj - 5) ib--;
        const nb = Math.round(0.62 * (ib - ia)), b0 = flip ? ib - nb : ia, bl = [];
        for (let i = b0; i <= b0 + nb; i++) bl.push(run[i][2]);
        bl.sort((p, q) => p - q);
        Wj = Math.min(Wj, 2 * (bl[Math.floor(bl.length * 0.15)] + 4));                    // the blade itself must fit the stroke under it
        let cv = 0; for (let i = ia; i <= ib; i++) cv += cov[i];
        if (cv > 0.6 * (ib - ia + 1)) continue;                                          // it would lie mostly on top of others: a pile, not a stroke
        const Lt = cum[ib] - cum[ia];
        if (Lt < ASP * Wj) Wj = Lt / ASP;
        if (Wj < Math.max(Wmin, 0.5 * Wr)) continue;
        const A = run[ia], B = run[ib], Md = run[(ia + ib) >> 1], C = [2 * Md[0] - (A[0] + B[0]) / 2, 2 * Md[1] - (A[1] + B[1]) / 2];
        const g0 = Math.max(0.5, 0.012 * Wj), Wk = Wj * r.range(0.97, 1.02);
        const M = (u, v) => {                   // (u, v) on the knife → the page, along a gentle arc through three points of the centre line
          let t = (u + g0) / Lt; if (flip) t = 1 - t;
          const q = 1 - t, x = q * q * A[0] + 2 * q * t * C[0] + t * t * B[0], y = q * q * A[1] + 2 * q * t * C[1] + t * t * B[1];
          const tx = q * (C[0] - A[0]) + t * (B[0] - C[0]), ty = q * (C[1] - A[1]) + t * (B[1] - C[1]), o = ((v - Wk / 2) * side) / (Math.hypot(tx, ty) || 1);
          return [x - ty * o, y + tx * o];
        };
        out.push(knife(M, Lt - 2 * g0, Wk, tag + info.key + out.length));
      }
    }
  }
  return out;
}

function build() {
  const info = K.glyphInfo(), SW = info.strokeWidth, bb = info.bbox;
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  const pap = K.paper({ base: '#efe7d3', tone: '#86683a', seed: 'g05paper', fiber: 0.55, stain: 0.3, foxing: 0.3, edge: 0.24 });
  g.drawImage(pap, 0, 0);
  // plate mark: the copper plate's bevel pressed into the damp sheet, and a breath of plate tone inside it
  const pm = 58;
  g.fillStyle = 'rgba(120,96,60,0.055)'; g.fillRect(pm, pm, S - 2 * pm, S - 2 * pm);
  g.lineWidth = 3; g.strokeStyle = 'rgba(70,50,25,0.13)'; g.strokeRect(pm + 1.5, pm + 1.5, S - 2 * pm, S - 2 * pm);
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,252,240,0.5)'; g.strokeRect(pm - 1.5, pm - 1.5, S - 2 * pm, S - 2 * pm);

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d');
  const r = L.rng('g05' + info.key), nz = L.makeNoise('g05n');
  const gk = L.clamp(SW / 75, 0.55, 1.1), gp = L.clamp(SW * 0.06, 2.2, 4.8);
  // the ground: a tablet in the shape of the glyph, filled with machine-ruled lines, so the knives lie on a pale grey character.
  // Its lower-right edges carry a shadow line (the tablet stands a card's thickness off the sheet).
  q.strokeStyle = INK; q.lineJoin = 'round'; q.lineCap = 'round';
  q.save(); q.translate(1.4 * gk, 1.8 * gk); q.lineWidth = 2.1 * gk; K.strokeGlyph(q); q.restore();
  q.save(); q.globalCompositeOperation = 'destination-out'; K.fillGlyph(q, '#000'); q.restore();
  q.save(); K.clipGlyph(q);
  q.strokeStyle = INK;
  for (let y = bb.y0 - 2; y < bb.y1 + 4; y += gp) {
    q.lineWidth = (0.66 + r.range(-0.08, 0.1)) * Math.max(0.8, gk); q.globalAlpha = r.range(0.74, 0.92);
    q.beginPath();
    for (let x = bb.x0 - 4; x <= bb.x1 + 28; x += 24) { const yy = y + Math.sin(x * 0.013 + y * 0.05) * 0.35; x === bb.x0 - 4 ? q.moveTo(x, yy) : q.lineTo(x, yy); }
    q.stroke();
  }
  q.restore();
  q.strokeStyle = INK; q.lineWidth = 1.2 * Math.max(0.75, gk); K.strokeGlyph(q);

  // the knives: each throws its shadow on whatever is already there, then covers it
  for (const kn of layout(info, 'g05k')) { castShadow(q, kn); drawKnife(q, kn, nz); }

  K.soak(ink, pap, 0.5);
  K.wear(ink, { seed: 'g05w', amount: 0.22, size: 1.2 });
  // intaglio ink stands a little proud of the sheet: a breath of light on the upper-left of every line
  const hl = L.makeCanvas(S, S), h = hl.getContext('2d');
  h.drawImage(ink, 0, 0); h.globalCompositeOperation = 'source-in'; h.fillStyle = '#fffaf0'; h.fillRect(0, 0, S, S);
  g.globalAlpha = 0.45; g.drawImage(hl, -0.5, -0.6); g.globalAlpha = 1;
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.94; g.drawImage(ink, 0, 0);
  g.globalAlpha = 0.16; g.drawImage(L.blurred(ink, 1.1), 0, 0);       // the ink's slight spread into the paper
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}

export default {
  name: '刀币线刻',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                          // a 3-frame flash: perfectly still
};
