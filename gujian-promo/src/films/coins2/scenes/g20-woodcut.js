// g20 — 木刻: a white-line woodcut on a black-inked block. The coin glyph is cut with the knife: a heavy outer rim with a thin
// companion line, a heavy inner rim around the square hole with its own thin line, and tiered radial hatching on the body.
// Everything white is paper showing through where the wood was cut away; the black is ink with dry "flying-white" along the grain.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const LIGHT = Math.atan2(-1, -1);                 // direction pointing to the top-left (where the light comes from)
let layer = null;

// one knife cut: a tapered polygon along pts ([x, y] samples), full width w. Pointed entry, longer pointed exit, faceted edges.
function gouge(g, pts, w, r, o = {}) {
  const n = pts.length; if (n < 3) return;
  const { t0 = 0.1, t1 = 0.22, wob = 0.13 } = o;
  const A = [], B = []; const ph = r() * 10;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const t = i / (n - 1);
    const tp = Math.pow(Math.min(1, t / t0), 0.7) * Math.pow(Math.min(1, (1 - t) / t1), 0.6);
    const ha = w * 0.5 * tp * (1 + wob * Math.sin(ph + i * 0.9) + r.range(-0.05, 0.05));
    const hb = w * 0.5 * tp * (1 + wob * Math.sin(ph * 1.7 + i * 0.63) + r.range(-0.05, 0.05));
    A.push([pts[i][0] - dy * ha, pts[i][1] + dx * ha]);
    B.push([pts[i][0] + dy * hb, pts[i][1] - dx * hb]);
  }
  g.beginPath(); g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
}
// samples along a straight cut with a slight hand drift
function seg(x0, y0, x1, y1, r, drift = 0.7) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(4, Math.round(len / 7));
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1); const ph = r() * 9, k = r.range(2, 5);
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, o = Math.sin(ph + t * k) * drift; out.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); }
  return out;
}
// samples along an arc
function arc(cx, cy, rad, a0, a1, r, drift = 0.7) {
  const n = Math.max(5, Math.round((Math.abs(a1 - a0) * rad) / 7)); const ph = r() * 9; const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = a0 + (a1 - a0) * t, rr = rad + Math.sin(ph + t * 4) * drift; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return out;
}

function buildCut() {
  const { cx, cy, R, a } = K.GLYPH;
  const c = L.makeCanvas(S, S), g = c.getContext('2d'); const r = L.rng('g20cut');
  g.fillStyle = '#fff';

  // ── outer rim: a heavy band whose OUTER edge is the glyph circle, a little wider on the lit side
  g.beginPath();
  const NO = 220;
  for (let i = 0; i <= NO; i++) { const t = (i / NO) * TAU, rr = R + 0.7 * Math.sin(t * 9 + 1) + r.range(-0.5, 0.5); i ? g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr) : g.moveTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr); }
  g.closePath();
  for (let i = 0; i <= NO; i++) {
    const t = (i / NO) * TAU, rr = R - (22 + 4 * Math.cos(t - LIGHT)) + 1.3 * Math.sin(t * 13 + 2) + 0.9 * Math.sin(t * 31) + r.range(-0.7, 0.7);
    i ? g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr) : g.moveTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr);
  }
  g.closePath(); g.fill('evenodd');
  // thin companion line, cut in a run of separate strokes (the knife is lifted and re-entered)
  {
    let t = r() * TAU; const end = t + TAU;
    while (t < end) {
      const span = Math.min(end - t, r.range(0.22, 0.52));
      gouge(g, arc(cx, cy, R - 39 + r.range(-0.6, 0.6), t - 0.012, t + span + 0.004, r, 0.5), r.range(3.4, 4.4), r, { t0: 0.05, t1: 0.1 });
      t += span + (r.chance(0.3) ? r.range(0.01, 0.03) : 0);
    }
  }

  // ── inner rim: heavy square band whose INNER edge is the hole, plus a thin square line with crossed corners
  {
    const band = (h, wob, seed) => {
      const q = L.rng(seed); const pts = [];
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let s = 0; s < 4; s++) {
        const [x0, y0] = cs[s], [x1, y1] = cs[(s + 1) % 4];
        for (let k = 0; k < 14; k++) {
          const t = k / 14, o = k === 0 ? 0 : wob * (Math.sin(t * 7 + s) * 0.6 + q.range(-0.5, 0.5));
          const px = (x0 + (x1 - x0) * t) * h, py = (y0 + (y1 - y0) * t) * h;
          const ox = x0 === x1 ? x0 * o : 0, oy = y0 === y1 ? y0 * o : 0;        // push along the side's normal
          pts.push([cx + px + ox, cy + py + oy]);
        }
      }
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    };
    g.beginPath(); band(a + 19, 1.5, 'g20bo'); band(a, 0.6, 'g20bi'); g.fill('evenodd');
    const d = a + 31;
    gouge(g, seg(cx - d - 9, cy - d, cx + d + 7, cy - d, r, 0.5), 4.2, r, { t0: 0.04, t1: 0.07 });
    gouge(g, seg(cx + d, cy - d - 8, cx + d, cy + d + 9, r, 0.5), 3.6, r, { t0: 0.04, t1: 0.07 });
    gouge(g, seg(cx + d + 8, cy + d, cx - d - 7, cy + d, r, 0.5), 3.4, r, { t0: 0.04, t1: 0.07 });
    gouge(g, seg(cx - d, cy + d + 7, cx - d, cy - d - 9, r, 0.5), 4.0, r, { t0: 0.04, t1: 0.07 });
  }

  // ── body: three tiers of radial hatching (long / medium / short), fatter towards the light
  const N = 72;
  const hatch = (ang, r0, r1, w) => {
    const m = 1 + 0.2 * Math.cos(ang - LIGHT); const ca = Math.cos(ang), sa = Math.sin(ang);
    const cutOne = (ra, rb) => gouge(g, seg(cx + ca * ra, cy + sa * ra, cx + ca * rb, cy + sa * rb, r, 0.6), w * m * r.range(0.88, 1.1), r);
    if (r1 - r0 > 70 && r.chance(0.22)) { const mid = L.lerp(r0, r1, r.range(0.4, 0.62)); cutOne(r0, mid - 4); cutOne(mid + 4, r1); } else cutOne(r0, r1);
  };
  const rin = (ang) => (a + 43) / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
  const ph0 = 0.013;
  for (let i = 0; i < N; i++) {
    const t0 = ph0 + (i / N) * TAU + r.range(-0.006, 0.006);
    hatch(t0, rin(t0) + r.range(0, 5), R - 47 - r.range(0, 5), 6.4);
    const t1 = ph0 + ((i + 0.5) / N) * TAU + r.range(-0.006, 0.006);
    hatch(t1, Math.max(rin(t1) + 4, 236 + r.range(-8, 8)), R - 47 - r.range(0, 5), 4.8);
    for (const f of [0.25, 0.75]) {
      const t2 = ph0 + ((i + f) / N) * TAU + r.range(-0.004, 0.004);
      hatch(t2, 292 + r.range(-7, 7), R - 48 - r.range(0, 4), 3.0);
    }
  }

  // ── the block's border line and a few stray tool marks in the uncut ground, well away from the coin
  {
    const e = 46;
    for (const [x0, y0, x1, y1] of [[e, e, S - e, e], [S - e, e, S - e, S - e], [S - e, S - e, e, S - e], [e, S - e, e, e]]) {
      let t = 0;
      while (t < 1) {
        const u = Math.min(1, t + r.range(0.18, 0.4));
        gouge(g, seg(L.lerp(x0, x1, t), L.lerp(y0, y1, t), L.lerp(x0, x1, u), L.lerp(y0, y1, u), r, 0.6), r.range(3.6, 4.6), r, { t0: 0.03, t1: 0.06 });
        t = u - 0.004;
      }
    }
    for (let i = 0, n = 0; i < 900 && n < 46; i++) {
      const x = r.range(70, S - 70), y = r.range(70, S - 70); if (Math.hypot(x - cx, y - cy) < R + 62) continue;
      const len = r.range(12, 34), an = r.range(-0.22, 0.22) + (r.chance(0.15) ? 0.6 : 0);
      gouge(g, seg(x, y, x + Math.cos(an) * len, y + Math.sin(an) * len, r, 0.4), r.range(1.8, 3.2), r, { t0: 0.2, t1: 0.4 }); n++;
    }
  }

  // ── what the knife left behind: thin slivers of wood standing in the heavy bands, and specks of ink on the cleared wood
  g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.strokeStyle = '#000'; g.fillStyle = '#000';
  for (let i = 0; i < 30; i++) {
    const t = r() * TAU, rad = R - r.range(5, 17), sp = r.range(0.03, 0.11);
    g.globalAlpha = r.range(0.5, 0.95); g.lineWidth = r.range(0.7, 1.5);
    g.beginPath(); g.arc(cx, cy, rad, t, t + sp); g.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const s = r.int(0, 3), u = r.range(-a, a - 30), off = a + r.range(5, 14), len = r.range(10, 30);
    g.globalAlpha = r.range(0.5, 0.95); g.lineWidth = r.range(0.7, 1.4); g.beginPath();
    if (s === 0) { g.moveTo(cx + u, cy - off); g.lineTo(cx + u + len, cy - off + r.range(-1, 1)); }
    else if (s === 1) { g.moveTo(cx + off, cy + u); g.lineTo(cx + off + r.range(-1, 1), cy + u + len); }
    else if (s === 2) { g.moveTo(cx + u, cy + off); g.lineTo(cx + u + len, cy + off + r.range(-1, 1)); }
    else { g.moveTo(cx - off, cy + u); g.lineTo(cx - off + r.range(-1, 1), cy + u + len); }
    g.stroke();
  }
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = r.range(0.25, 0.85);
    g.beginPath(); g.ellipse(r() * S, r() * S, r.range(0.4, 1.5), r.range(0.3, 1.0), r() * 3, 0, TAU); g.fill();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#eee5d0', tone: '#8a6a3a', seed: 'g20paper', fiber: 0.6, stain: 0.3, foxing: 0.12, edge: 0.1 }), 0, 0);

  const ink = L.makeCanvas(S, S), q = ink.getContext('2d'); const r = L.rng('g20ink');
  q.fillStyle = '#15110e'; q.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i++) {                                 // uneven inking: slightly greyer, warmer patches
    const x = r() * S, y = r() * S, rr = r.range(30, 150);
    q.fillStyle = L.radial(q, x, y, 0, rr, [[0, `rgba(74,62,50,${r.range(0.05, 0.16).toFixed(3)})`], [1, 'rgba(74,62,50,0)']]);
    q.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  q.globalCompositeOperation = 'destination-out';
  q.drawImage(buildCut(), 0, 0);
  // flying white: dry streaks along the (horizontal) wood grain, gathered in patches and towards the block's edges
  q.lineCap = 'round'; q.strokeStyle = '#000';
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S;
    const patch = 0.5 + 0.5 * Math.sin(x * 0.0061 + 1.3 + Math.sin(y * 0.004) * 1.5) * Math.sin(y * 0.0093 + 0.4 + Math.sin(x * 0.003) * 1.2);
    const edge = Math.max(0, 1 - Math.min(x, y, S - x, S - y) / 90);
    const dens = Math.max(patch * patch * patch * 0.8, edge * 0.9);
    if (r() > dens) continue;
    const len = r.range(14, 120), wv = r.range(-1.2, 1.2);
    q.globalAlpha = r.range(0.06, 0.34) * (0.5 + dens); q.lineWidth = r.range(0.5, 1.4);
    q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + len * 0.5, y + wv, x + len, y + r.range(-0.8, 0.8)); q.stroke();
  }
  q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
  K.wear(ink, { seed: 'g20wear', amount: 0.32, size: 1.3 });      // pores where the paper's tooth did not take the ink

  g.drawImage(ink, 0, 0);
  return c;
}

export default {
  name: '木刻',
  init() { layer = build(); },
  draw(ctx) { ctx.drawImage(layer, 0, 0); },                      // a 3-frame flash: perfectly still
};
