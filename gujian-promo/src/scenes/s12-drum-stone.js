// s12 — 抱鼓石 (the drum of a drum-shaped door stone), macro, warm-white raking light from the upper left.
// Behind it, far out of focus, the green-lacquered leaf of the house door (绿油屏门) it stands in front of.
// The arc is the upper silhouette of the stone drum. Going inward from it:
//   鼓帮 (the thick tooled edge, with chips) → a half-round bead → a ring of 鼓钉 (domed bosses) →
//   a band of 回纹 in sunk-ground relief → the drum face with scrolling lotus (缠枝莲) in low relief.
// Everything is carved as a float HEIGHT FIELD first, then lit per pixel (diffuse + cast shadows + cavity
// occlusion + a little polish) and baked into one layer that slides along the arc.
import * as L from '../lib/core.js';

const { W, H } = L;
const PX = 100;   // side margin of the baked stone layer (px)
const PT = 44;    // rows kept above the crest (room for the bloom)
const PB = 64;    // rows kept below the frame
const PAD = 110;  // margin of the out-of-focus door layer (18 px blur + its small parallax move)
let S = null;

// radial layout, d = px inward from the arc
const D = {
  rim: 50,                 // 鼓帮: 0 → 50
  bead0: 50, bead1: 68,    // half-round bead on the arris
  ch0: 76, ch1: 142,       // sunk channel that holds the nails
  nail: 109, nailR: 26.5, nailPitch: 86,
  fr0: 164, fr1: 270,      // 回纹 band (sunk ground)
  face: 295,               // drum face ground starts here
};
const HRIM = 47;           // how far the edge falls away behind the face plane (px of height)
const H_NAIL = 24, H_FRET = 10, H_SCROLL = 13;
const DOOR_BAND = 0.55; // strength of the soft band of light on the door

const ss = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

/** height of the plain turned profile at depth d (datum 0 = the dressed face plane) */
function profile(d) {
  let h = 0;
  if (d < D.rim) { const t = d / D.rim; h = -HRIM * (1 - (0.68 * t + 0.32 * (1 - (1 - t) * (1 - t)))); }
  if (d > D.bead0 && d < D.bead1) h += 7 * Math.pow(Math.sin((Math.PI * (d - D.bead0)) / (D.bead1 - D.bead0)), 0.8);
  h -= 8 * (ss(D.ch0 - 2, D.ch0 + 2, d) - ss(D.ch1 - 2, D.ch1 + 2, d));
  h -= H_FRET * (ss(D.fr0 - 4, D.fr0, d) - ss(D.fr1, D.fr1 + 4, d));
  h -= 9 * ss(D.face - 5, D.face, d);
  return h;
}
/** 1 on dressed/raised surfaces, 0 on sunk grounds, ~0.25 on the tooled edge */
function raisedProfile(d) {
  let r = 1 - (ss(D.ch0 - 2, D.ch0 + 2, d) - ss(D.ch1 - 2, D.ch1 + 2, d)) - (ss(D.fr0 - 4, D.fr0, d) - ss(D.fr1, D.fr1 + 4, d)) - ss(D.face - 5, D.face, d);
  return L.lerp(0.22, r, ss(D.rim - 5, D.rim + 2, d));
}

// ───────────────────────── carved masks (white = raised) ─────────────────────────

/** 回纹: squared spirals, drawn with concentric arcs + radial lines so they sit true on the drum */
function drawFret(g, a) {
  const pitch = 26, lw = 13;
  const Rm = a.R - (D.fr0 + D.fr1) / 2;
  const colA = pitch / Rm;
  const unitA = (4 * pitch + lw + 17) / Rm;
  const d0 = (D.fr0 + D.fr1) / 2 - 1.5 * pitch;
  const path = [[0, 3], [0, 0], [4, 0], [4, 3], [1, 3], [1, 1], [3, 1], [3, 2], [2, 2]];
  const n = Math.ceil(a.span(PX + 80) / unitA) + 1;
  g.strokeStyle = '#fff'; g.lineWidth = lw; g.lineJoin = 'miter'; g.lineCap = 'square';
  for (let k = -n; k <= n; k++) {
    const t0 = (k + 0.5) * unitA - 2 * colA;
    g.beginPath();
    for (let i = 0; i < path.length; i++) {
      const [u, v] = path[i];
      const th = t0 + u * colA, dd = d0 + v * pitch;
      if (i === 0) { const p = a.pt(th, -dd); g.moveTo(p.x, p.y); continue; }
      const [pu, pv] = path[i - 1];
      if (v === pv) { const thp = t0 + pu * colA; g.arc(a.cx, a.cy, a.R - dd, thp - Math.PI / 2, th - Math.PI / 2, th < thp); }
      else { const p = a.pt(th, -dd); g.lineTo(p.x, p.y); }
    }
    g.stroke();
  }
}

/** drum face: a lotus bloom on the axis with a bold running scroll (缠枝) — stem, volutes and leaves — round the face */
function drawScroll(g, a) {
  const RS = a.R - 400;
  const P = (s, d) => { const p = a.pt(s / RS, -d); return [p.x, p.y]; };
  const stemD = (s) => 396 - 52 * Math.cos((Math.PI * (s - 230)) / 270);
  const grooves = [];   // incised lines cut after everything is filled

  const ribbon = (ctl, w0, w1, sign, o = {}) => {
    const pts = L.smoothPath(ctl, 5).map(([s, d]) => P(sign * s, d));
    const n = pts.length;
    const trace = (grow, from) => {
      const A = [], B = [];
      for (let i = from; i < n; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
        let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
        const hw = L.lerp(w0, w1, Math.pow(i / (n - 1), o.pow || 1)) / 2 + grow;
        A.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]); B.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
      }
      g.beginPath(); g.moveTo(A[0][0], A[0][1]);
      for (let i = 1; i < A.length; i++) g.lineTo(A[i][0], A[i][1]);
      for (let i = B.length - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
      g.closePath(); g.fill();
      const e = pts[n - 1]; g.beginPath(); g.arc(e[0], e[1], (o.bulb || w1 / 2) + grow, 0, L.TAU); g.fill();
    };
    if (o.cut) { g.fillStyle = '#000'; trace(o.cut, Math.floor(n * (o.cutFrom === undefined ? 0.14 : o.cutFrom))); }
    g.fillStyle = '#fff'; trace(0, 0);
  };
  const spiral = (cs, cd, r0, r1, phi0, turns, dir, n = 44) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, phi = phi0 + dir * turns * L.TAU * t, r = r0 * Math.pow(r1 / r0, Math.pow(t, 0.85));
      out.push([cs + r * Math.cos(phi), cd + r * Math.sin(phi)]);
    }
    return out;
  };
  // leaf / petal: pointed blade from base b to tip, bowed sideways by `bend`
  const blade = (b, tip, bend, wid, sign, o = {}) => {
    const [bs, bd] = b, [ts, td] = tip;
    const ex = ts - bs, ey = td - bd, len = Math.hypot(ex, ey) || 1;
    const c = [(bs + ts) / 2 - (ey / len) * bend, (bd + td) / 2 + (ex / len) * bend];
    const A = [], B = [], mid = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n, q = 1 - t;
      const x = q * q * bs + 2 * q * t * c[0] + t * t * ts, y = q * q * bd + 2 * q * t * c[1] + t * t * td;
      const tx = 2 * q * (c[0] - bs) + 2 * t * (ts - c[0]), ty = 2 * q * (c[1] - bd) + 2 * t * (td - c[1]); const m = Math.hypot(tx, ty) || 1;
      const nx = -ty / m, ny = tx / m;
      const w = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, o.belly || 0.72)), 0.85) + (o.neck || 3) * q;
      A.push(P(sign * (x + nx * w), y + ny * w)); B.push(P(sign * (x - nx * w), y - ny * w)); mid.push(P(sign * x, y));
    }
    g.beginPath(); g.moveTo(A[0][0], A[0][1]);
    for (let i = 1; i <= n; i++) g.lineTo(A[i][0], A[i][1]);
    for (let i = n; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
    g.closePath();
    g.strokeStyle = '#000'; g.lineWidth = o.cut === undefined ? 8 : o.cut; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = '#fff'; g.fill();
    if (o.rib !== 0) grooves.push(mid.slice(Math.round(n * (o.rib0 || 0.12)), Math.round(n * (o.rib || 0.8))));
  };

  for (const sign of [1, -1]) {
    // main stem: one long wave round the face
    const stem = [];
    for (let s = 6; s <= 1160; s += 18) stem.push([s, stemD(s)]);
    ribbon(stem, 23, 17, sign);
    for (const sc of [230, 770]) {
      // volute curling into the bay under each crest
      ribbon([[sc - 84, stemD(sc - 84) + 2], [sc - 30, 369], ...spiral(sc + 10, 432, 56, 14, L.deg(-80), 1.25, 1)], 22, 12, sign, { cut: 5, bulb: 14 });
      // leaves riding over the crest
      blade([sc - 74, stemD(sc - 74) - 6], [sc + 12, 311], -16, 32, sign);
      blade([sc + 62, stemD(sc + 62) - 6], [sc + 152, 318], 13, 30, sign);
    }
    for (const st of [500, 1040]) {
      // volute curling into the bay above each trough
      ribbon([[st - 100, stemD(st - 100) - 2], [st - 44, 424], ...spiral(st + 4, 368, 50, 13, L.deg(78), 1.25, -1)], 22, 12, sign, { cut: 5, bulb: 14 });
      blade([st + 94, stemD(st + 94) - 6], [st + 134, 332], -16, 31, sign);
    }
  }
  // lotus bloom on the axis: far petals, near petals, seed pod
  const F = [0, 464];
  const petal = (beta, r0, r1, wid, o) => {
    const dx = Math.sin(L.deg(beta)), dy = -Math.cos(L.deg(beta));
    blade([F[0] + dx * r0, F[1] + dy * r0], [F[0] + dx * r1, F[1] + dy * r1], 0, wid, 1, { belly: 0.6, neck: 8, cut: 9, ...o });
  };
  for (const b of [-150, 150, -112, 112, -76, 76, -38, 38, 0]) petal(b, 14, 144, 78, { rib0: 0.42, rib: 0.82 });
  for (const b of [-95, 95, -57, 57, -19, 19]) petal(b, 14, 100, 60, { rib: 0 });
  const pc = P(F[0], F[1]);
  g.fillStyle = '#000'; g.beginPath(); g.arc(pc[0], pc[1], 36, 0, L.TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(pc[0], pc[1], 30, 0, L.TAU); g.fill();
  g.fillStyle = '#000';
  for (let i = 0; i < 7; i++) {
    const q = i === 0 ? [0, 0] : [17 * Math.cos((i * L.TAU) / 6 + 0.5), 17 * Math.sin((i * L.TAU) / 6 + 0.5)];
    g.beginPath(); g.arc(pc[0] + q[0], pc[1] + q[1], 4.2, 0, L.TAU); g.fill();
  }
  // incised midribs
  g.strokeStyle = '#000'; g.lineWidth = 2.6; g.lineCap = 'round';
  for (const m of grooves) { g.beginPath(); g.moveTo(m[0][0], m[0][1]); for (const q of m) g.lineTo(q[0], q[1]); g.stroke(); }
}

/** tooling + weathering depth. red = fine tool marks (suppressed on polished parts), green = deep pits / chips / cracks */
function drawDamage(g, a, Y0, GH, chips) {
  const r = L.rng('s12dmg');
  const x0 = -PX, x1 = W + PX, y0 = Y0, y1 = Y0 + GH;
  g.globalCompositeOperation = 'lighter';
  // point-chisel stipple
  for (const [alpha, count, rmin, rmax] of [[0.35, 11000, 0.6, 1.3], [0.6, 9000, 0.7, 1.7], [0.95, 5500, 0.8, 2.1]]) {
    g.fillStyle = `rgba(255,0,0,${alpha})`; g.beginPath();
    for (let i = 0; i < count; i++) { const x = r.range(x0, x1), y = r.range(y0, y1), rad = r.range(rmin, rmax); g.moveTo(x + rad, y); g.arc(x, y, rad, 0, L.TAU); }
    g.fill();
  }
  // slanting chisel strokes across the thick edge
  const sp = a.span(PX + 80);
  g.lineCap = 'round';
  for (const alpha of [0.4, 0.7, 1]) {
    g.strokeStyle = `rgba(255,0,0,${alpha})`; g.lineWidth = 2; g.beginPath();
    a.along({ spacing: 14, t0: -sp, t1: sp }, (q) => {
      for (const row of [0, 1]) {
        const th = q.theta + r.range(-0.003, 0.003), d0 = row ? r.range(20, 30) : r.range(3, 10), len = r.range(14, 26);
        const p0 = a.pt(th, -d0), p1 = a.pt(th + (len * 0.42) / a.R, -(d0 + len * 0.9));
        g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y);
      }
    });
    g.stroke();
  }
  // weathering pits
  for (const [alpha, count, rmin, rmax] of [[0.45, 300, 1.2, 2.6], [0.8, 170, 1.6, 4.0], [1, 46, 3, 6.5]]) {
    g.fillStyle = `rgba(0,255,0,${alpha})`; g.beginPath();
    for (let i = 0; i < count; i++) {
      const x = r.range(x0, x1), y = r.range(y0, y1), rad = r.range(rmin, rmax);
      g.moveTo(x + rad, y); g.ellipse(x, y, rad, rad * r.range(0.55, 1), r.range(0, 3.14), 0, L.TAU);
    }
    g.fill();
  }
  // knocked-off flakes: along the arris / bead, on the fillets and here and there on the carving
  const flake = (x, y, rad, alpha) => {
    const n = r.int(5, 8), rot = r.range(0, L.TAU);
    g.fillStyle = `rgba(0,255,0,${alpha})`; g.beginPath();
    for (let i = 0; i < n; i++) { const an = rot + (i / n) * L.TAU, rr = rad * r.range(0.55, 1.15); const px = x + Math.cos(an) * rr * 1.5, py = y + Math.sin(an) * rr * 0.8; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath(); g.fill();
  };
  for (let i = 0; i < 34; i++) { const p = a.pt(r.range(-sp, sp), -r.pick([50, 52, 66, 76, 143, 160, 272, 290]) + r.range(-3, 3)); flake(p.x, p.y, r.range(3, 9), r.range(0.5, 1)); }
  for (let i = 0; i < 22; i++) { const p = a.pt(r.range(-sp, sp), -r.range(80, 520)); flake(p.x, p.y, r.range(3, 8), r.range(0.4, 0.9)); }
  // scoops behind the bites in the silhouette
  for (const c of chips) {
    a.at(g, c.th, -c.dep * 0.4, () => { g.fillStyle = 'rgba(0,255,0,0.9)'; g.beginPath(); g.ellipse(0, 0, c.w * 0.95, c.dep * 1.9 + 3, 0, 0, L.TAU); g.fill(); });
  }
  // two hairline cracks wandering in from the edge
  const crack = (th, dEnd, drift, seed) => {
    const rr = L.rng(seed); let t = th, d = -2; const pts = [];
    while (d < dEnd) { const p = a.pt(t, -d); pts.push([p.x, p.y]); d += rr.range(9, 22); t += (drift + rr.range(-9, 9)) / a.R; }
    g.strokeStyle = 'rgba(0,255,0,0.85)'; g.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) { g.lineWidth = L.lerp(2.3, 0.9, i / pts.length); g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  };
  crack(0.118, 360, 2.2, 's12crackA');
  crack(-0.292, 190, -3.0, 's12crackB');
}

/** unlit stone colour: cool blue-white 青白石 with faint cool/warm blotches, rain streaks and mineral specks */
function buildAlbedo(GW, GH) {
  const c = L.makeCanvas(GW, GH), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#e9ece8'; g.fillRect(0, 0, GW, GH);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(L.noiseTex(GW, GH, { seed: 's12a', scale: 300, octaves: 4, warp: 0.6, res: 0.2, ramp: [[0, '#aab4b3'], [0.5, '#e6eae7'], [1, '#ffffff']] }), 0, 0);
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.32;
  g.drawImage(L.noiseTex(GW, GH, { seed: 's12b', scale: 170, octaves: 3, res: 0.2, ramp: [[0, '#5e7a86'], [0.5, '#808080'], [1, '#a39672']] }), 0, 0);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6;
  g.drawImage(L.noiseTex(GW, GH, { seed: 's12c', scale: 24, octaves: 3, res: 0.5, contrast: 1.5, ramp: [[0, '#8d9694'], [0.55, '#ffffff'], [1, '#ffffff']] }), 0, 0);
  g.globalAlpha = 0.22;
  g.drawImage(L.noiseTex(GW, GH, { seed: 's12d', scale: 90, sx: 0.4, sy: 5, octaves: 3, res: 0.33, contrast: 1.7, warp: 0.4, ramp: [[0, '#4f5f5d'], [0.45, '#ffffff'], [1, '#ffffff']] }), 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  L.speckle(g, { seed: 's12sp', count: 5200, x: 0, y: 0, w: GW, h: GH, rMin: 0.4, rMax: 1.7, colors: ['#3f4947', '#232b2a', '#eef0ea', '#6c7773'], alpha: [0.15, 0.6] });
  return g.getImageData(0, 0, GW, GH).data;
}

/** separable box blur on a float field (2 passes ≈ gaussian) */
function boxBlur(src, w, h, rad) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const k = 1 / (rad * 2 + 1);
  let a = src, b = tmp;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let x = -rad; x <= rad; x++) acc += a[o + (x < 0 ? 0 : x)];
      for (let x = 0; x < w; x++) {
        b[o + x] = acc * k;
        const xa = x + rad + 1, xr = x - rad;
        acc += a[o + (xa >= w ? w - 1 : xa)] - a[o + (xr < 0 ? 0 : xr)];
      }
    }
    a = b; b = out;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += a[(y < 0 ? 0 : y) * w + x];
      for (let y = 0; y < h; y++) {
        b[y * w + x] = acc * k;
        const ya = y + rad + 1, yr = y - rad;
        acc += a[(ya >= h ? h - 1 : ya) * w + x] - a[(yr < 0 ? 0 : yr) * w + x];
      }
    }
    a = out; b = tmp;
  }
  return out;
}

function buildStone(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const Y0 = Math.floor(a.crestY) - PT;
  const GW = W + PX * 2, GH = H + PB - Y0, N = GW * GH;
  const mk = () => {
    const c = L.makeCanvas(GW, GH), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, GW, GH); g.translate(PX, -Y0);
    return { c, g };
  };
  const read = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, GW, GH).data;

  // ── carved masks ──
  const fr = mk(); drawFret(fr.g, a);
  const fretD = read(L.blurred(fr.c, 1.1));
  const sc = mk(); drawScroll(sc.g, a);
  const scB = L.makeCanvas(GW, GH), sg = scB.getContext('2d', { willReadFrequently: true });
  sg.fillStyle = '#000'; sg.fillRect(0, 0, GW, GH);
  sg.globalCompositeOperation = 'lighter'; sg.globalAlpha = 0.5;
  sg.filter = 'blur(1.4px)'; sg.drawImage(sc.c, 0, 0);
  sg.filter = 'blur(5px)'; sg.drawImage(sc.c, 0, 0);
  const scrollD = sg.getImageData(0, 0, GW, GH).data;

  // ── silhouette bites ──
  const span = a.span(PX + 60);
  const er = L.rng('s12edge'); const chips = [];
  for (let th = -span; th < span;) { th += er.range(60, 190) / R; chips.push({ th, w: er.range(10, 34), dep: er.range(2, 6) }); }
  chips.push({ th: -0.208, w: 54, dep: 7 }, { th: 0.262, w: 42, dep: 6.5 }, { th: 0.082, w: 24, dep: 5.5 }, { th: -0.33, w: 30, dep: 6 }, { th: -0.062, w: 18, dep: 4.5 });
  const NE = Math.ceil(span * 2 * R * 2);
  const E = new Float32Array(NE + 2);
  const nz = L.makeNoise('s12edge');
  for (let i = 0; i <= NE; i++) {
    const th = -span + i / (2 * R); let e = 0.5 + 0.7 * nz.n2(th * R / 7, 3.1) + 0.5 * nz.n2(th * R / 31, 9.4);
    for (const c of chips) { const x = ((th - c.th) * R) / c.w; if (x > -1 && x < 1) e = Math.max(e, c.dep * Math.pow(1 - x * x, 0.75) * (0.8 + 0.2 * nz.n2(th * R / 5, 1.7))); }
    E[i] = e < 0 ? 0 : e;
  }
  const dm = mk(); drawDamage(dm.g, a, Y0, GH, chips);
  const dmgD = read(L.blurred(dm.c, 0.6));

  // slow undulation of the dressed surface + how worn the carving is
  const undD = read(L.noiseTex(GW, GH, { seed: 's12und', scale: 120, octaves: 3, res: 0.2 }));
  const wearD = read(L.noiseTex(GW, GH, { seed: 's12wear', scale: 95, octaves: 3, res: 0.2, contrast: 1.3 }));

  // ── nails ──
  const NP = D.nailPitch / (R - D.nail);
  const NK = Math.ceil(span / NP) + 2, nN = NK * 2 + 1;
  const nJT = new Float32Array(nN), nJD = new Float32Array(nN), nR = new Float32Array(nN), nH = new Float32Array(nN), nCap = new Float32Array(nN);
  const nr = L.rng('s12nails');
  for (let i = 0; i < nN; i++) {
    nJT[i] = nr.range(-2.5, 2.5) / R; nJD[i] = nr.range(-1.5, 1.5); nR[i] = D.nailR + nr.range(-1.6, 1.2);
    nH[i] = nr.range(0.9, 1.05); nCap[i] = nr.chance(0.22) ? nr.range(0.62, 0.82) : 2;
  }

  // ── height field ──
  const Hh = new Float32Array(N), Rz = new Float32Array(N), Al = new Float32Array(N), Cr = new Float32Array(N), Kk = new Float32Array(N);
  const LUT0 = -64, LUTS = 4, LUTN = (760 - LUT0) * LUTS + 2;
  const pl = new Float32Array(LUTN), rl = new Float32Array(LUTN);
  for (let i = 0; i < LUTN; i++) { const d = LUT0 + i / LUTS; pl[i] = profile(d); rl[i] = raisedProfile(d); }
  const gr = L.rng('s12grain');
  let i = 0;
  for (let iy = 0; iy < GH; iy++) {
    const dyc = cy - (iy + Y0 + 0.5);
    for (let ix = 0; ix < GW; ix++, i++) {
      const dxc = ix - PX + 0.5 - cx;
      const r = Math.sqrt(dxc * dxc + dyc * dyc);
      let d = R - r;
      const noise = (gr() - 0.5) * 0.22;
      if (d < -50) { Hh[i] = pl[(-50 - LUT0) * LUTS]; continue; }
      const lf = (d - LUT0) * LUTS, li = lf | 0, lt = lf - li;
      let h = pl[li] + (pl[li + 1] - pl[li]) * lt;
      let rz = rl[li] + (rl[li + 1] - rl[li]) * lt;
      const i4 = i * 4;
      const wr = wearD[i4] / 255;
      const worn = 0.6 + 0.4 * ss(0.2, 0.6, wr);
      if (d < 14 || (d > D.ch0 - 4 && d < D.ch1 + 4)) {
        const theta = Math.atan2(dxc, dyc);
        if (d < 14) {
          const e = E[Math.max(0, Math.min(NE, Math.round((theta + span) * 2 * R)))];
          const al = d - e + 0.5;
          Al[i] = al <= 0 ? 0 : al >= 1 ? 1 : al;
          // the shadow-side half of the arris catches a thin cool kicker off the door; it follows the bites
          Kk[i] = ss(0.02, 0.22, theta) * (1 - ss(2, 7, d - e));
        } else {
          Al[i] = 1;
          const kf = Math.round(theta / NP), ki = kf + NK;
          if (ki >= 0 && ki < nN) {
            const ds = (theta - (kf * NP + nJT[ki])) * r, dd = d - (D.nail + nJD[ki]);
            const q2 = (ds * ds + dd * dd) / (nR[ki] * nR[ki]);
            if (q2 < 1) {
              let q = Math.pow(1 - q2, 0.7) * nH[ki];
              if (q > nCap[ki]) q = nCap[ki] + (q - nCap[ki]) * 0.15;
              h += H_NAIL * q;
              const pz = q * 2.4; if (pz > rz) rz = pz > 1 ? 1 : pz;
            }
          }
        }
      } else Al[i] = 1;
      if (d > D.fr0 - 5 && d < D.fr1 + 5) { const m = (fretD[i4] / 255) * worn; h += H_FRET * m; if (m > rz) rz = m; }
      else if (d > D.face - 6) { const m = (scrollD[i4] / 255) * (0.5 + 0.5 * worn); h += H_SCROLL * m; const mz = m * 1.3; if (mz > rz) rz = mz > 1 ? 1 : mz; }
      h += ((undD[i4] - 128) / 128) * 1.8 + noise;
      h -= (dmgD[i4] / 255) * (d < D.rim ? 2.3 : 1.7 * (1 - 0.8 * rz)) + (dmgD[i4 + 1] / 255) * 5;
      Hh[i] = h; Rz[i] = rz;
      // rain-darkened crust on the tooled edge, heaviest right at the top — on the lit (left) half only, so the
      // shadow-side silhouette is not dimmed against the dark door
      Cr[i] = d < D.rim + 4 ? 0.9 - 0.12 * (1 - ss(0, 16, d)) * (1 - ss(-140, 40, dxc)) + 0.1 * ss(D.rim - 6, D.rim + 4, d) : 1;
    }
  }

  // ── light it ──
  const Hb = boxBlur(Hh, GW, GH, 6);
  const alb = buildAlbedo(GW, GH);
  let lx = -0.62, ly = -0.56, lz = 0.52; { const m = Math.hypot(lx, ly, lz); lx /= m; ly /= m; lz /= m; }
  const hl = Math.hypot(lx, ly), ux = lx / hl, uy = ly / hl, tanE = lz / hl;
  let hx = lx, hy = ly, hz = lz + 1; { const m = Math.hypot(hx, hy, hz); hx /= m; hy /= m; hz /= m; }
  const STEPS = [1.5, 3, 4.5, 6, 8, 10, 12.5, 15, 18, 21, 25, 29, 34, 40];
  const sOff = STEPS.map((t) => Math.round(uy * t) * GW + Math.round(ux * t));
  const sRise = STEPS.map((t) => t * tanE + 0.35);
  const sSoft = STEPS.map((t) => 1 / (0.5 + 0.08 * t));
  const NS = STEPS.length;
  const KA = 0.30, KD = 1.5;
  const tone = (x) => (x < 0.72 ? x : 0.72 + 0.28 * (1 - Math.exp(-(x - 0.72) / 0.28)));
  const img = new ImageData(GW, GH), o = img.data;
  for (let iy = 1; iy < GH - 1; iy++) {
    for (let ix = 1; ix < GW - 1; ix++) {
      const p = iy * GW + ix;
      const al = Al[p]; if (al <= 0) continue;
      const h0 = Hh[p];
      const gx = (Hh[p + 1] - Hh[p - 1]) * 0.5, gy = (Hh[p + GW] - Hh[p - GW]) * 0.5;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv, ny = -gy * inv, nzz = inv;
      let ndl = nx * lx + ny * ly + nzz * lz;
      let sh = 1;
      if (ndl > 0) {
        for (let k = 0; k < NS; k++) {
          const j = p + sOff[k]; if (j < 0) break;
          const dh = Hh[j] - h0 - sRise[k];
          if (dh > 0) { const s = 1 - dh * sSoft[k]; if (s < sh) { sh = s; if (sh <= 0) { sh = 0; break; } } }
        }
      } else ndl = 0;
      const rz = Rz[p];
      const conv = h0 - Hb[p];
      let ao = 1 + conv * 0.075; ao = ao < 0.3 ? 0.3 : ao > 1 ? 1 : ao;
      let edge = conv * 0.1; edge = edge < 0 ? 0 : edge > 1 ? 1 : edge;
      const dif = KD * ndl * sh;
      const amb = KA * (0.4 + 0.6 * ao);
      // green bounce off the lacquered door, reaching the faces turned away from the lamp
      const fill = 0.13 * Math.max(0, nx * 0.6 + ny * 0.3 + nzz * 0.5);
      const rim = Kk[p] * 0.22;
      const ndh = nx * hx + ny * hy + nzz * hz;
      const sp1 = ndh > 0 ? Math.pow(ndh, 38) : 0;
      const spec = sh * (sp1 * (0.05 + 0.42 * rz + 0.2 * edge) + sp1 * sp1 * sp1 * 0.5 * rz);
      const fresh = dmgD[p * 4 + 1] / 255;
      const k = (1 - 0.25 * (1 - rz)) * (1 + 0.1 * edge) * (0.8 + 0.2 * ao) * (1 + 0.14 * fresh) * Cr[p];
      const p4 = p * 4;
      // handled, raised carving has gone ivory; the sunk grounds stay cool
      const ar = (alb[p4] / 255) * k * (1 + 0.04 * rz), ag = (alb[p4 + 1] / 255) * k, ab = (alb[p4 + 2] / 255) * k * (1 - 0.09 * rz);
      o[p4] = 255 * tone(ar * (amb * 0.70 + dif + fill * 0.35) + spec + rim * 0.78);
      o[p4 + 1] = 255 * tone(ag * (amb * 1.00 + dif * 0.975 + fill) + spec * 0.86 + rim);
      o[p4 + 2] = 255 * tone(ab * (amb * 0.96 + dif * 0.925 + fill * 0.62) + spec * 0.6 + rim * 0.90);
      o[p4 + 3] = 255 * al;
    }
  }
  const stone = L.makeCanvas(GW, GH);
  stone.getContext('2d').putImageData(img, 0, 0);
  return { stone, bloom: L.blurred(stone, 11), Y0 };
}

/**
 * The backdrop, far out of focus: one leaf of the green-lacquered screen door (绿油屏门) behind the door stone, in the
 * spill of the same lamp. Only colour, a slanting band of soft light, two plank joints and the craze of old lacquer —
 * no studs, knockers or lettering (studs belong to palace gates).
 */
function buildDoor(env) {
  const a = env.arc;
  const X0 = -PAD, Y0 = -PAD, FW = W + PAD * 2, FH = H + PAD * 2;
  const base = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#1d6b45'; g.fillRect(X0, Y0, FW, FH);
    // the lamp's pool falls off to the right
    g.fillStyle = L.linear(g, 0, 0, W, 0, [[0, '#1d6b45'], [500 / W, '#23875a'], [1100 / W, '#145a3a'], [1700 / W, '#06231a'], [1, '#06231a']]);
    g.fillRect(X0, Y0, FW, FH);
    // slanting band of soft light: centre x = 560 at y = 0, drifting right 0.25 px per px down, half-width 400
    g.save(); g.globalCompositeOperation = 'screen';
    g.transform(1, 0, 0.25, 1, 0, 0);
    const bell = [[0, 0], [0.14, 0.07], [0.3, 0.42], [0.42, 0.86], [0.5, 1], [0.58, 0.86], [0.7, 0.42], [0.86, 0.07], [1, 0]];
    g.fillStyle = L.linear(g, 160, 0, 960, 0, bell.map(([t, v]) => [t, L.rgba('#2f9a62', DOOR_BAND * v)]));
    g.fillRect(160, Y0, 800, FH);
    g.restore();
    // two plank joints, deliberately uneven (evenly spaced crisp lines read as a roller shutter)
    g.fillStyle = '#04170f';
    g.fillRect(310 - 5, Y0, 10, FH); g.fillRect(1480 - 5, Y0, 10, FH);
  });
  const door = L.blurred(base, 18);
  const g = door.getContext('2d');
  g.translate(PAD, PAD);
  // a streak of sheen on the lacquer
  const sheen = L.blurred(L.makeLayer(PAD, (c) => {
    c.fillStyle = L.linear(c, 0, Y0, 0, a.crestY + 260, [[0, 'rgba(191,232,207,0.55)'], [0.35, '#bfe8cf'], [1, 'rgba(191,232,207,0.7)']]);
    c.fillRect(640 - 40, Y0, 80, FH);
  }), 30);
  g.save(); g.globalAlpha = 0.10; g.drawImage(sheen, -PAD, -PAD); g.restore();
  // craze of old lacquer: long cracks down the grain with short cross-checks, kept soft — texture on a defocused
  // plane, not drawn lines
  const craze = L.blurred(L.makeLayer(PAD, (c) => {
    const r = L.rng('s12craze');
    c.strokeStyle = '#082a1c'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 64; i++) {
      let x = r.range(X0, X0 + FW), y = r.range(Y0 - 200, a.crestY + 200);
      const len = r.range(160, 640);
      c.lineWidth = r.range(1, 1.5);
      c.beginPath(); c.moveTo(x, y);
      const ticks = [];
      for (let t = 0; t < len;) {
        const st = r.range(16, 44); t += st; y += st; x += r.range(-2.4, 2.4); c.lineTo(x, y);
        if (r.chance(0.22)) ticks.push([x, y, r.sign() * r.range(10, 46), r.range(-3, 3)]);
      }
      c.stroke();
      c.lineWidth = 1;
      for (const [tx, ty, dx, dy] of ticks) { c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + dx * 0.5, ty + dy * 0.3 + r.range(-1.5, 1.5)); c.lineTo(tx + dx, ty + dy); c.stroke(); }
    }
  }), 5);
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3; g.drawImage(craze, -PAD, -PAD); g.restore();
  // contact shade where the door meets the stone's silhouette, so the edge keeps its bite on the dark side too
  g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 70, [[0, 'rgba(0,0,0,0.30)'], [0.45, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(X0, Y0, FW, FH);
  return door;
}

export default {
  name: '抱鼓石',
  tone: 'light',
  init(env) {
    S = { ...buildStone(env), door: buildDoor(env) };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.011, 0.011, p), zoom = L.lerp(1.0, 1.022, p);
    // far plane: the green door, moving a third as much as the stone
    ctx.fillStyle = '#0c3d29'; ctx.fillRect(0, 0, W, H);
    L.blit(ctx, env, S.door, { rot: rot * 0.3, zoom: 1 + (zoom - 1) * 0.3 });
    // the carved stone slides slowly under a lamp that does not move
    L.cam(ctx, env, { rot, zoom }, (c) => c.drawImage(S.stone, -PX, S.Y0));
    // lamp falloff and the warm key belong to the stone only (clipped to its silhouette, which zooms with it)
    ctx.save();
    L.cam(ctx, env, { zoom }, (c) => a.pathBelow(c, 1));
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.radial(ctx, a.cx - 430, a.crestY - 140, 260, 1750, [[0, '#ffffff'], [0.42, '#d6dcd9'], [0.76, '#7f8c8a'], [1, '#3a4a48']]);
    ctx.fillRect(0, 0, W, H);
    L.glow(ctx, a.cx - 330, a.crestY + 70, 780, '#ffe6c2', 0.20, 'overlay');
    ctx.restore();
    // bloom: a little of it spills over the silhouette onto the door
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.14;
    L.cam(ctx, env, { rot, zoom }, (c) => c.drawImage(S.bloom, -PX, S.Y0));
    ctx.restore();
  },
};
