// s34 — 明式圈椅线图 (film: antiques). A macro look at a furniture survey drawing on white drafting paper: the plan
// (top view) of a round-back armchair, cropped tight on the back of its horseshoe rail.
//
// The shared arc is the OUTER EDGE of the rail (椅圈) — the heaviest ink line on the sheet. Inside it run the rail's
// centre line (dash-dot) and inner edge, so the round stock reads as one broad band. On the band: two 楔钉榫 scarf
// seams, each a stepped lap line with the small square peg in its middle. Below the band: the hatched, bowed section of
// the splat (靠背板), the mitred seat frame (攒框: rear 大边, two 抹头, 45° 格角 seams, hidden where the rail covers it),
// the rear posts as hidden circles under the rail, and the cane seat (藤屉) as two families of ruled 45° lines — one
// family still unfinished on the right, with its pencil setting-out showing. A vermilion centre axis and a vermilion
// pair struck from the crest, plus one ultramarine locating line through the right-hand seam, are ruled over it all.
// Dimension lines carry arrows and slashes only: no figures, no lettering anywhere.
//
// NOTE on scale: the drawing is schematic, not a survey. With the rail's outer edge pinned to the film's arc (R ≈ 2400 px)
// a true-to-scale chair would put the posts and the cane far out of frame, so the back of the horseshoe is drawn
// flatter than a real one and the seat frame narrower. Every part keeps its own correct form and its correct neighbours.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 90;                       // the camera only breathes (zoom 0.992 → 1.012, rot ±0.002)
const LW = W + PAD * 2, LH = H + PAD * 2;
const INK = '#1a1a1a', RED = '#d23a2a', BLUE = '#2a6fb8', PAPER = '#f4f2ec', LEAD = '#4a4844';
const NZ = L.makeNoise('s34-hand');
let SEQ = 0;
let S = null;

// ───────────────────────── polylines ─────────────────────────
function seg(x0, y0, x1, y1, step = 7) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([L.lerp(x0, x1, i / n), L.lerp(y0, y1, i / n)]);
  return out;
}
function arcSeg(a, dr, t0, t1, step = 7) {
  const n = Math.max(2, Math.ceil((Math.abs(t1 - t0) * (a.R + dr)) / step)), out = [];
  for (let i = 0; i <= n; i++) { const p = a.pt(L.lerp(t0, t1, i / n), dr); out.push([p.x, p.y]); }
  return out;
}
function circSeg(x, y, r, a0 = 0, a1 = L.TAU, step = 5) {
  const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / step)), out = [];
  for (let i = 0; i <= n; i++) { const t = L.lerp(a0, a1, i / n); out.push([x + r * Math.cos(t), y + r * Math.sin(t)]); }
  return out;
}
/** cut a polyline into dashes. pat = [on, off, on, off …] in px; returns an array of polylines */
function dashes(pts, pat, phase = 0, jit = null) {
  const n = pts.length, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[n - 1];
  const at = (d) => {
    let i = 1; while (i < n - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [L.lerp(pts[i - 1][0], pts[i][0], t), L.lerp(pts[i - 1][1], pts[i][1], t)];
  };
  const out = [];
  let d = -phase, k = 0;
  while (d < total) {
    const len = pat[k % pat.length] * (jit ? 1 + jit.range(-0.1, 0.1) : 1);
    if (k % 2 === 0) {
      const d0 = Math.max(0, d), d1 = Math.min(total, d + len);
      if (d1 - d0 > 0.8) {
        const run = [at(d0)];
        for (let i = 0; i < n; i++) if (cum[i] > d0 + 0.5 && cum[i] < d1 - 0.5) run.push(pts[i]);
        run.push(at(d1));
        out.push(run);
      }
    }
    d += len; k++;
  }
  return out;
}

// ───────────────────────── the pens ─────────────────────────
/**
 * A ruled ink line, drawn as a filled ribbon whose width breathes a little (the nib opening, the paper's tooth)
 * and that sits a hair off true. opts: w, color, alpha, vary (0..0.2), wob (px), blob (0 | radius factor at the start)
 */
function pen(g, pts, o = {}) {
  const { w = 3, color = INK, alpha = 1, vary = 0.07, wob = 0.3, blob = 0, blobEnd = 0 } = o;
  const n = pts.length; if (n < 2) return;
  const sd = (SEQ += 7.31);
  const lx = new Float32Array(n), ly = new Float32Array(n), rx = new Float32Array(n), ry = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
    let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const k = 1 + vary * NZ.n2(s / 52, sd) + vary * 0.5 * NZ.n2(s / 7.5, sd + 31);
    const hw = Math.max(0.35, w * 0.5 * k), off = wob * NZ.n2(s / 110, sd + 77);
    lx[i] = pts[i][0] + nx * (hw + off); ly[i] = pts[i][1] + ny * (hw + off);
    rx[i] = pts[i][0] - nx * (hw - off); ry[i] = pts[i][1] - ny * (hw - off);
  }
  g.save();
  g.globalAlpha *= alpha; g.fillStyle = color;
  g.beginPath(); g.moveTo(lx[0], ly[0]);
  for (let i = 1; i < n; i++) g.lineTo(lx[i], ly[i]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(rx[i], ry[i]);
  g.closePath(); g.fill();
  if (blob) { g.beginPath(); g.arc(pts[0][0], pts[0][1], w * 0.5 * blob, 0, L.TAU); g.fill(); }
  if (blobEnd) { g.beginPath(); g.arc(pts[n - 1][0], pts[n - 1][1], w * 0.5 * blobEnd, 0, L.TAU); g.fill(); }
  g.restore();
}
/** a ruled colour line: felt-tip ink, a little translucent, darker along both edges where the ink gathers */
function marker(g, pts, w, color) {
  pen(g, pts, { w, color, alpha: 0.86, vary: 0.05, wob: 0.5, blob: 1.04, blobEnd: 1.02 });
  pen(g, pts, { w: w * 0.5, color, alpha: 0.32, vary: 0.2, wob: 1.0 });
  const n = pts.length;
  // lengthwise streaks left by the fibres of the tip
  for (const [f, lw, al] of [[-0.24, 1.3, 0.3], [0.1, 1.0, 0.24], [0.3, 1.2, 0.28]]) {
    const e = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1;
      e.push([pts[i][0] + (nx / m) * f * w, pts[i][1] + (ny / m) * f * w]);
    }
    pen(g, e, { w: lw, color: L.shade(color, 0.42), alpha: al, vary: 0.5, wob: 0.5 });
  }
  for (const side of [-1, 1]) {
    const e = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1;
      e.push([pts[i][0] + (nx / m) * side * (w * 0.5 - 0.9), pts[i][1] + (ny / m) * side * (w * 0.5 - 0.9)]);
    }
    pen(g, e, { w: 1.5, color: L.shade(color, -0.25), alpha: 0.4, vary: 0.2, wob: 0.2 });
  }
}
/** pencil: two passes that do not quite agree, pressure easing along the stroke (the tooth is bitten in afterwards) */
function lead(g, x0, y0, x1, y1, w, al, rr) {
  const k0 = rr.range(0.65, 1.1), k1 = rr.range(0.75, 1.15), k2 = rr.range(0.6, 1.05);
  g.save(); g.lineCap = 'round';
  g.strokeStyle = L.linear(g, x0, y0, x1, y1, [[0, L.rgba(LEAD, al * k0)], [rr.range(0.3, 0.7), L.rgba(LEAD, al * k1)], [1, L.rgba(LEAD, al * k2)]]);
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  const o = rr.range(-1, 1), o2 = rr.range(-0.5, 0.5);
  g.globalAlpha = 0.5; g.lineWidth = w * 0.7;
  g.beginPath(); g.moveTo(x0 + o, y0 + o2); g.lineTo(x1 - o2, y1 + o * 0.4); g.stroke();
  g.restore();
}
function leadArc(g, a, dr, t0, t1, w, al) {
  g.save(); g.strokeStyle = L.rgba(LEAD, al); g.lineWidth = w; g.lineCap = 'round';
  a.stroke(g, dr, t0, t1);
  g.restore();
}
/** filled arrowhead, tip at (x,y), pointing along ang */
function arrowHead(g, x, y, ang, len = 23, hw = 6.5) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = INK;
  g.beginPath(); g.moveTo(0.5, 0); g.lineTo(-len, -hw); g.lineTo(-len * 0.8, 0); g.lineTo(-len, hw); g.closePath(); g.fill();
  g.restore();
}
/** the short 45° slash that closes a dimension line; ang = direction of the dimension line */
function slashMark(g, x, y, ang, len = 26, w = 3.6) {
  g.save(); g.translate(x, y); g.rotate(ang - Math.PI / 4);
  pen(g, seg(-len / 2, 0, len / 2, 0, 5), { w, vary: 0.1 });
  g.restore();
}
/** random-alpha tile used to bite strokes with paper tooth (destination-out) */
function toothTile(seed, size, density, scale = 1) {
  const n = Math.round(size / scale);
  const c = L.makeCanvas(n, n), g = c.getContext('2d');
  const img = new ImageData(n, n), d = img.data, r = L.rng(seed);
  for (let i = 0; i < d.length; i += 4) d[i + 3] = r() < density ? 255 * Math.pow(r(), 0.6) : 0;
  g.putImageData(img, 0, 0);
  if (scale === 1) return c;
  const out = L.makeCanvas(size, size), og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.drawImage(c, 0, 0, size, size);
  return out;
}
function bite(layer, tile, alpha) {
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = alpha;
  g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, layer.width, layer.height);
  g.restore();
}

// ───────────────────────── the drawing ─────────────────────────
function build(env) {
  const T0 = performance.now(); const lap = (n) => console.log('s34 ' + n + ' ' + (performance.now() - T0).toFixed(0));
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy, y0 = a.crestY;
  const sp = a.span(PAD + 160);
  SEQ = 0;

  // the chair, in plan (see the note on scale at the top)
  const T = 116;                          // width of the rail's round stock
  const SEAT_Y = y0 + 150;                // rear outer edge of the seat frame
  const FR = 120;                         // width of a seat-frame member (大边 / 抹头)
  const INNER_Y = SEAT_Y + FR;            // inner edge of the rear 大边
  const BEAD = 14;                        // the strip (压条) that holds the cane
  const POST_R = 42;
  const Rc = R - T / 2;
  const postY = SEAT_Y + POST_R + 4;      // the rear posts stand in the seat's rear corners, under the rail's centre line
  const postDX = Math.sqrt(Rc * Rc - (cy - postY) * (cy - postY));
  const XO = postDX + POST_R + 4, XI = XO - FR;
  const SPL_HW = 214, SPL_T = 40, SPL_R = 640, SPL_Y = SEAT_Y + 15;   // splat section: half-width, thickness, bow radius, top
  const TS = 0.19, SL = 84;               // scarf seams: angle from the crest, half-run along the rail
  // the cane: two families of 45° lines, both set out from the crest so the vermilion pair are its master lines
  const P = 70, u0 = cx + y0, v0 = cx - y0;
  const xl = cx - XI + BEAD, xr = cx + XI - BEAD, yt = INNER_Y + BEAD, yb = H + PAD + 30;
  const KU = [Math.ceil((xl + yt - u0) / P), Math.floor((xr + yb - u0) / P)];
  const KV = [Math.ceil((xl - yb - v0) / P), Math.floor((xr - yt - v0) / P)];
  const KCUT = 0;                         // "\" lines to the right of this one are still only pencil
  // where a 45° line meets the arc (upper intersection)
  const hitU = (u, dr = 0) => { const c = u - cx - cy, r = R + dr, Y = (c - Math.sqrt(2 * r * r - c * c)) / 2; return [u - (cy + Y), cy + Y]; };
  const hitV = (v, dr = 0) => { const c = v - cx + cy, r = R + dr, Y = (-c - Math.sqrt(2 * r * r - c * c)) / 2; return [v + (cy + Y), cy + Y]; };
  const seamPt = a.pt(TS, -T / 2);
  const uBlue = seamPt.x + seamPt.y;      // the ultramarine locating line runs through the right-hand peg

  // ───────── 1. pencil setting-out ─────────
  const pencil = L.makeLayer(PAD, (g) => {
    const r = L.rng('s34-lead');
    // the 45° net of the cane, every line, running a little past the bead
    for (let k = KU[0]; k <= KU[1]; k++) {
      const u = u0 + k * P, ya = Math.max(yt, u - xr), yz = Math.min(yb, u - xl);
      if (yz - ya < 6) continue;
      const o = r.range(6, 22);
      lead(g, u - ya + o, ya - o, u - yz, yz, 1.25, 0.5, r);
    }
    for (let k = KV[0]; k <= KV[1]; k++) {
      const v = v0 + k * P, ya = Math.max(yt, xl - v), yz = Math.min(yb, xr - v);
      if (yz - ya < 6) continue;
      const o = r.range(6, 22), strong = k > KCUT ? 1.5 : 1;
      lead(g, v + ya - o, ya - o, v + yz, yz, 1.25 * (k > KCUT ? 1.2 : 1), 0.5 * strong, r);
    }
    // master lines (every second one) carried up across the frame and the rail to the rail's outer edge
    for (let k = -14; k <= 14; k++) {
      if (k === 0 || k % 2) continue;
      for (const fam of [0, 1]) {
        if (r.chance(0.12)) continue;
        const top = fam ? hitV(v0 + k * P, -5) : hitU(u0 + k * P, -5);
        let y1 = Math.max(yt, fam ? xl - (v0 + k * P) : u0 + k * P - xr);
        if (y1 > H + PAD) continue;
        const x1 = fam ? v0 + k * P + y1 : u0 + k * P - y1;
        if (top[1] > y1 - 20) continue;
        lead(g, top[0], top[1], x1, y1, 2.0, r.range(0.78, 1), r);
      }
    }
    // graphite rubbed along both edges of the rail, so the round stock turns
    g.save(); a.clipBand(g, 0, -T);
    g.fillStyle = L.radial(g, cx, cy, R - T, R, [[0, L.rgba(LEAD, 0.2)], [0.26, L.rgba(LEAD, 0.04)], [0.55, L.rgba(LEAD, 0)], [0.78, L.rgba(LEAD, 0.06)], [1, L.rgba(LEAD, 0.3)]]);
    g.fillRect(-PAD, -PAD, LW, LH);
    g.restore();
    // trial arcs from the beam compass
    leadArc(g, a, -T / 2 + 2.5, -sp, sp, 1.3, 0.36);
    leadArc(g, a, -T + 4.5, -0.33, 0.08, 1.2, 0.4);
    leadArc(g, a, -T - 30, -0.24, -0.02, 1.6, 0.14);      // a rubbed-out arc
    // setting-out of the seat's rear edge, overshooting on both sides of the visible stretch
    lead(g, cx - 560, SEAT_Y + 1.5, cx + 600, SEAT_Y - 1, 1.3, 0.5, r);
      });
  bite(pencil, toothTile('s34-t2', 256, 0.6, 2), 0.5);
  bite(pencil, toothTile('s34-t1', 256, 0.5, 1), 0.3);

  lap('pencil');
  // ───────── 2. vermilion and ultramarine ─────────
  const colour = L.makeLayer(PAD, (g) => {
    const drop = H + PAD + 40 - y0;
    // the pair struck from the crest
    marker(g, seg(cx, y0 + 1, cx - drop, y0 + drop), 12, RED);
    marker(g, seg(cx, y0 + 1, cx + drop, y0 + drop), 12, RED);
    // the centre axis, dash-dot
    for (const d of dashes(seg(cx, y0 + 2, cx, H + PAD + 40, 6), [96, 15, 12, 15], 0)) marker(g, d, 6.2, RED);
    // the locating line through the right-hand seam
    const b0 = hitU(uBlue, -3);
    marker(g, seg(b0[0], b0[1], uBlue - (H + PAD + 40), H + PAD + 40), 10.4, BLUE);
    // a ring round the peg it locates
    for (const c of [circSeg(seamPt.x, seamPt.y, 26)]) pen(g, c, { w: 4.6, color: BLUE, alpha: 0.9 });
  });
  bite(colour, toothTile('s34-t3', 256, 0.5, 2), 0.26);

  lap('colour');
  // ───────── 3. ink ─────────
  const ink = L.makeLayer(PAD, (g) => {
    const r = L.rng('s34-ink');
    // ── the rail: outer edge = THE arc, centre line, inner edge ──
    pen(g, arcSeg(a, -2, -sp, sp), { w: 10, vary: 0.05, wob: 0.45 });
    pen(g, arcSeg(a, -T, -sp, sp), { w: 4.6, vary: 0.07 });
    for (const sg of [-1, 1]) for (const d of dashes(arcSeg(a, -T / 2, 0, sg * sp, 4), [54, 10, 7, 10], 27, r)) pen(g, d, { w: 2.5, vary: 0.1 });
    // ── 楔钉榫: a stepped lap seam with the square peg through its middle ──
    for (const sg of [-1, 1]) a.at(g, sg * TS, -T / 2, () => {
      g.scale(sg, 1);
      pen(g, seg(-SL, -T / 2 + 4, SL, T / 2 - 2), { w: 3.4, blob: 1.15, blobEnd: 1.15 });
      g.fillStyle = INK;
      g.beginPath(); g.moveTo(-10, -9.4); g.lineTo(9.4, -10); g.lineTo(10, 9.4); g.lineTo(-9.4, 10); g.closePath(); g.fill();
    });
    // rail thickness: arrows only
    a.at(g, 0.077, 0, () => {
      pen(g, seg(0, 10, 0, T - 5, 6), { w: 2.1 });
      arrowHead(g, 0, 6, -Math.PI / 2, 26, 7.5); arrowHead(g, 0, T - 3, Math.PI / 2, 26, 7.5);
    });

    // ── everything that lies under the rail is hidden (dashed); below the rail's inner edge it is drawn solid ──
    const seat = (hidden) => {
      const line = (x0, yy0, x1, yy1, w) => {
        if (!hidden) { pen(g, seg(x0, yy0, x1, yy1), { w }); return; }
        for (const d of dashes(seg(x0, yy0, x1, yy1, 4), [17, 10], 4, r)) pen(g, d, { w: Math.max(1.8, w * 0.56), vary: 0.12, alpha: 0.85 });
      };
      for (const sg of [-1, 1]) {
        line(cx, SEAT_Y, cx + sg * XO, SEAT_Y, 4.4);                               // rear edge of the 大边
        line(cx + sg * XO, SEAT_Y, cx + sg * XO, H + PAD + 30, 4.4);               // outer edge of the 抹头
        line(cx + sg * XO, SEAT_Y, cx + sg * XI, INNER_Y, 2.8);                    // 格角 mitre
        if (!hidden) {
          line(cx, SEAT_Y + 10, cx + sg * (XO - 10), SEAT_Y + 10, 1.7);               // the moulded edge (冰盘沿) steps in once
          line(cx, INNER_Y, cx + sg * XI, INNER_Y, 3.8);                           // inner edge of the frame
          line(cx + sg * XI, INNER_Y, cx + sg * XI, H + PAD + 30, 3.8);
          line(cx, yt, cx + sg * (XI - BEAD), yt, 2.1);                            // the bead holding the cane
          line(cx + sg * (XI - BEAD), yt, cx + sg * (XI - BEAD), H + PAD + 30, 2.1);
          line(cx + sg * XI, INNER_Y, cx + sg * (XI - BEAD), yt, 1.7);
        } else {
          for (const d of dashes(circSeg(cx + sg * postDX, postY, POST_R, 0.3, 0.3 + L.TAU, 3), [17, 10], 0, r)) pen(g, d, { w: 3, vary: 0.12 });
          pen(g, seg(cx + sg * postDX - 13, postY, cx + sg * postDX + 13, postY, 5), { w: 1.6 });
          pen(g, seg(cx + sg * postDX, postY - 13, cx + sg * postDX, postY + 13, 5), { w: 1.6 });
        }
      }
    };
    g.save(); a.clipBelow(g, -T - 1.9); seat(false); g.restore();
    g.save(); a.clipBand(g, -6, -T + 1.9); seat(true); g.restore();

    // ── the splat (靠背板) in section: a bowed board, hatched ──
    {
      const ccy = SPL_Y + SPL_R, ph = Math.asin(SPL_HW / SPL_R);
      const outline = () => {
        g.beginPath();
        g.arc(cx, ccy, SPL_R, -Math.PI / 2 - ph, -Math.PI / 2 + ph, false);
        g.arc(cx, ccy, SPL_R - SPL_T, -Math.PI / 2 + ph, -Math.PI / 2 - ph, true);
        g.closePath();
      };
      g.save(); outline(); g.clip();
      for (let x = cx - SPL_HW - 100; x < cx + SPL_HW + 40; x += 14) pen(g, seg(x + r.range(-0.8, 0.8), SPL_Y + 92, x + 98, SPL_Y - 6, 6), { w: r.range(2.0, 2.5), vary: 0.12 });
      g.restore();
      const top = [], bot = [];
      for (let i = 0; i <= 60; i++) {
        const t = -Math.PI / 2 + L.lerp(-ph, ph, i / 60);
        top.push([cx + SPL_R * Math.cos(t), ccy + SPL_R * Math.sin(t)]);
        bot.push([cx + (SPL_R - SPL_T) * Math.cos(t), ccy + (SPL_R - SPL_T) * Math.sin(t)]);
      }
      pen(g, top, { w: 4.2 }); pen(g, bot, { w: 4.2 });
      pen(g, [top[0], bot[0]], { w: 4.2 }); pen(g, [top[60], bot[60]], { w: 4.2 });
    }

    // ── the cane seat (藤屉): ruled 45° lines; the "\" family stops part-way on the right ──
    for (let k = KU[0]; k <= KU[1]; k++) {
      if (k === 0) continue;
      const u = u0 + k * P + r.range(-1.1, 1.1), ya = Math.max(yt, u - xr), yz = Math.min(yb, u - xl);
      if (yz - ya < 6) continue;
      const o = r.range(-4, 2.5);
      pen(g, seg(u - ya - o, ya + o, u - yz, yz), { w: r.range(2.3, 3.1), alpha: r.range(0.88, 1), blob: r.chance(0.3) ? 1.35 : 0 });
    }
    for (let k = KV[0]; k <= KCUT + 3; k++) {
      if (k === 0) continue;
      const v = v0 + k * P + r.range(-1.1, 1.1), ya = Math.max(yt, xl - v);
      let yz = Math.min(yb, xr - v);
      if (yz - ya < 6) continue;
      if (k > KCUT) yz = Math.min(yz, ya + [0, 176, 108, 44][k - KCUT]);
      const o = r.range(-4, 2.5);
      pen(g, seg(v + ya + o, ya + o, v + yz, yz), { w: r.range(2.3, 3.1), alpha: r.range(0.88, 1), blob: r.chance(0.3) ? 1.35 : 0, blobEnd: k > KCUT ? 1.3 : 0 });
    }

    // ── width of the 大边: a dimension line closed by two slashes ──
    {
      const x = cx - 356;
      pen(g, seg(x, SEAT_Y - 16, x, INNER_Y + 16), { w: 2.1 });
      slashMark(g, x, SEAT_Y, Math.PI / 2); slashMark(g, x, INNER_Y, Math.PI / 2);
    }
  });
  // ink is never perfectly even: it thins in patches, and the tooth nibbles it a little
  {
    const g = ink.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out';
    g.drawImage(L.noiseTex(LW, LH, { seed: 's34-inkden', scale: 46, octaves: 3, res: 0.25, contrast: 1.7, ramp: [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.15)']] }), 0, 0);
    g.restore();
  }
  bite(ink, toothTile('s34-t4', 256, 0.35, 1), 0.16);

  lap('ink');
  // ───────── 4. the sheet ─────────
  const paper = L.paperTex(LW, LH, { base: '#fcfaf5', seed: 3401, tone: '#a09a88', fiber: 0.32, stain: 0.1, grain: 0.12 });
  const toothBump = L.bumpLight(L.noiseTex(512, 512, { seed: 's34-tooth', scale: 3.4, octaves: 2, res: 1, contrast: 1.6 }), { angle: 45, strength: 1.8, res: 1 });
  lap('paper');
  let sheet = L.makeLayer(PAD, (g) => {
    g.drawImage(paper, -PAD, -PAD);
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.55;
    g.fillStyle = g.createPattern(toothBump, 'repeat'); g.fillRect(-PAD, -PAD, LW, LH);
    g.restore();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(pencil, -PAD, -PAD);
    g.globalAlpha = 0.5; g.drawImage(L.blurred(colour, 3.6), -PAD, -PAD); g.globalAlpha = 1;
    g.drawImage(colour, -PAD, -PAD);
    g.globalAlpha = 0.3; g.drawImage(L.blurred(ink, 1.5), -PAD, -PAD); g.globalAlpha = 1;
    g.drawImage(ink, -PAD, -PAD);
  });
  sheet = L.blurred(sheet, 0.35);

  lap('sheet');
  // ───────── 5. light and lens, baked into the sheet ─────────
  {
    const g = sheet.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    // focus sits on the crest; the picture softens toward the corners
    const ox = a.cx + PAD, oy = a.crestY + PAD + 60;
    const defocus = (px, r0, r1) => {
      const b = L.blurred(sheet, px), bg = b.getContext('2d');
      bg.save(); bg.globalCompositeOperation = 'destination-in';
      bg.translate(ox, oy); bg.scale(2.0, 1);
      bg.fillStyle = L.radial(bg, 0, 0, r0, r1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
      bg.fillRect(-LW, -LH, LW * 2, LH * 2);
      bg.restore();
      return b;
    };
    const soft1 = defocus(1.2, 270, 540), soft2 = defocus(2.8, 440, 820);
    g.drawImage(soft1, 0, 0); g.drawImage(soft2, 0, 0);
    // window light from the upper left
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.linear(g, PAD, PAD, PAD + W, PAD + H, [[0, '#ffffff'], [0.6, '#fdfcfa'], [1, '#f3f1ec']]);
    g.fillRect(0, 0, LW, LH);
    g.fillStyle = L.radial(g, PAD - 260, PAD - 300, 200, 1000, [[0, 'rgba(84,78,74,0.1)'], [1, 'rgba(84,78,74,0)']]);
    g.fillRect(0, 0, LW, LH);
    g.restore();
  }
  lap('lens');
  return { sheet };
}

export default {
  name: '明式圈椅线图',
  tone: 'dark',
  init(env) { S = build(env); },
  draw(ctx, env, p) {
    // a slow push-in on the crest and a hair of slide round the rail's centre
    const zoom = L.lerp(0.992, 1.012, p), rot = L.lerp(-0.0022, 0.0022, p);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.sheet, { rot, zoom });
  },
};
