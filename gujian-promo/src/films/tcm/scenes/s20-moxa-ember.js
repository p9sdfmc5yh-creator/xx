// s20 — 艾灸火头. Extreme macro of the smouldering tip of a moxa stick (艾条), the whole frame in soft focus.
// Two blocks of value and nothing else: the amber glow the ember throws (above the arc) and the dark, charred dome
// (below it). The arc is the dome's upper silhouette — a hazy terminator, hottest orange right on the line, falling
// through crimson into dark red within a few dozen pixels. Under it, charred moxa floss (艾绒) whose fibres run
// vertically; between the fibres sit grains of fire, seen as vertically stretched, out-of-focus glints; lower down a
// thin veil of pale ash clings to the fibres. One barely-there thread of smoke far out on each side.
//
// The ember (and the halation that spills over its limb) is shaded per pixel at half resolution in init(), then given
// a shallow depth of field: sharpest in a band just under the crest, melting toward the sides and the bottom of frame.
// The glints are additive sprites that flicker deterministically from the frame number.
import * as L from '../../../lib/core.js';

const { W, H } = L;
const PAD = 100;
let S = null;

const sstep = (a, b, v) => { const t = L.clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// palette (task sheet): 炽橙 #ff7a1a · 琥珀橙 #d9661f · 火头暗红 #7a1410 · 炭褐 #2a0c08 · 艾灰 #cfc4b4
const RF = 6500;   // fibres fan out very slightly from a point far below the frame → reads as "vertical", but on a dome
// where the ash lies: [arc-length from the crest, depth below the arc, half-width, half-height] — three tufts, none alike
const ASH = [[250, 340, 170, 200], [-640, 500, 230, 200], [780, 430, 120, 170]];

/** the glow above the arc: orange-red hugging the ember, easing up into amber. Smooth — it is completely out of focus. */
function buildBack(env) {
  const a = env.arc;
  return L.makeLayer(PAD, (g) => {
    const full = () => g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    const r0 = a.R - 60, r1 = a.R + 1000, at = (dr) => (dr + 60) / (r1 - r0);
    g.fillStyle = L.radial(g, a.cx, a.cy, r0, r1, [
      [0, '#e6411a'], [at(0), '#e8461a'], [at(40), '#e54e1b'], [at(110), '#e0581c'], [at(220), '#dc611e'],
      [at(380), '#d9661f'], [at(640), '#d3621f'], [at(1000), '#bf551c']]);
    full();
    // the light is not even: warmer and brighter low on the left, cooler and deeper toward the upper right
    g.fillStyle = L.radial(g, 470, a.yAt(470) - 210, 0, 900, [[0, 'rgba(255,152,44,0.22)'], [0.5, 'rgba(255,140,40,0.1)'], [1, 'rgba(255,140,40,0)']]);
    full();
    g.fillStyle = L.radial(g, 1800, 20, 0, 1000, [[0, 'rgba(146,24,20,0.3)'], [0.55, 'rgba(146,24,20,0.11)'], [1, 'rgba(146,24,20,0)']]);
    full();
    g.fillStyle = L.radial(g, -60, -40, 0, 760, [[0, 'rgba(120,30,14,0.2)'], [1, 'rgba(120,30,14,0)']]);
    full();
  });
}

/** one thread of smoke: a folded, drifting sheet drawn as many hair-thin strands, then thrown far out of focus */
function buildSmoke(env, side) {
  const a = env.arc;
  const x0 = side < 0 ? 300 : 1632;
  const bx = x0 - 330, by = -PAD - 40, bw = 660, bh = a.yAt(x0) + 60 - by;
  const c = L.makeCanvas(bw, bh), g = c.getContext('2d');
  g.translate(-bx, -by);
  const nz = L.makeNoise('s20smoke' + side), r = L.rng('s20smoke' + side);
  const yb = a.yAt(x0) + 34, rise = yb - by + 30;
  const NS = 52, NT = 96, ph = r.range(0, 6.28);
  g.lineCap = 'round';
  for (let s = 0; s < NS; s++) {
    const sv = s / (NS - 1), wgt = r.range(0.5, 1), lw = r.range(0.9, 2.2);
    let px = 0, py = 0;
    for (let t = 0; t <= NT; t++) {
      const tv = t / NT;
      const axis = x0 + side * 40 * tv + 54 * Math.sin(tv * 3.4 + ph) * Math.pow(tv, 0.8) + 30 * nz.n2(tv * 1.7, 4.2) * tv;
      const wid = 5 + 124 * Math.pow(tv, 1.25);
      const fold = 0.72 * Math.sin(L.TAU * (0.5 * sv + 0.75 * tv + 0.4 * nz.n2(tv * 1.5, 7.7))) + 0.5 * nz.n2(sv * 1.4 + 3, tv * 2.3);
      const x = axis + wid * fold, y = yb - rise * tv;
      if (t > 0) {
        const al = sstep(0, 0.1, tv) * (1 - sstep(0.4, 0.98, tv)) * wgt;
        if (al > 0.004) {
          const wm = 1 - sstep(0.04, 0.3, tv);          // lit warm by the ember where it leaves it, cooling as it climbs
          g.strokeStyle = `rgba(${Math.round(214 + 40 * wm)},${Math.round(216 - 40 * wm)},${Math.round(220 - 110 * wm)},${(0.068 * al).toFixed(3)})`; g.lineWidth = lw * (1 + 1.6 * tv);
          g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
        }
      }
      px = x; py = y;
    }
  }
  const out = L.makeCanvas(bw, bh), og = out.getContext('2d');
  og.filter = 'blur(26px)'; og.drawImage(c, 0, 0);
  og.filter = 'blur(10px)'; og.globalAlpha = 0.35; og.drawImage(c, 0, 0);
  og.filter = 'none';
  return { c: out, x: bx, y: by };
}

/** the ember itself: everything below the arc, plus the halation that spills over its limb */
function buildEmber(env) {
  const a = env.arc, R = a.R, cx = a.cx, cy = a.cy;
  const RES = 0.5, TOP = 200;
  const X0 = -PAD, Y0 = Math.floor(a.crestY) - TOP;
  const FW = W + PAD * 2, FH = H + PAD - Y0;
  const cw = Math.ceil(FW * RES), ch = Math.ceil(FH * RES);
  const nA = L.makeNoise('s20a'), nB = L.makeNoise('s20b'), nC = L.makeNoise('s20c');
  const fcy = a.crestY + RF;
  const img = new ImageData(cw, ch), o = img.data;
  const mMid = new ImageData(cw, ch), mFar = new ImageData(cw, ch);     // depth-of-field masks (alpha only)
  const hotMap = new Float32Array(cw * ch);
  // emission ramp: nothing → dull red → orange-red → 炽橙 → a touch hotter at the very core
  const emF = L.makeRamp([[0, [0, 0, 0]], [0.2, [92, 12, 8]], [0.45, [214, 52, 18]], [0.72, [255, 122, 26]], [1, [255, 194, 108]]]);
  const EM = new Float32Array(257 * 3);
  for (let i = 0; i <= 256; i++) { const c = emF(i / 256); EM[i * 3] = c[0]; EM[i * 3 + 1] = c[1]; EM[i * 3 + 2] = c[2]; }

  for (let j = 0; j < ch; j++) {
    const y = Y0 + (j + 0.5) / RES, ddy = cy - y, fv = y - a.crestY;
    for (let i = 0; i < cw; i++) {
      const x = X0 + (i + 0.5) / RES, ddx = x - cx;
      const rr = Math.sqrt(ddx * ddx + ddy * ddy), d = R - rr;      // d = depth below the arc
      if (d < -(TOP - 8)) continue;
      const k = j * cw + i, q = k * 4, dd = d < 0 ? 0 : d;
      const U = Math.atan2(ddx, ddy) * R;
      // the limb does not glow evenly: it burns thicker in some stretches than in others
      const tk = 0.74 + 0.5 * (nC.n2(U / 520 + 3.1, 0.7) * 0.5 + 0.5) + 0.14 * nC.n2(U / 170 - 8, 2.2);
      // depth of field: focus sits ~150 px under the limb at the crest; the sides and the crown of the dome fall away
      const zd = d < 150 ? (150 - d) / 200 : (d - 150) / 430;
      const z = zd + 0.85 * sstep(360, 1040, Math.abs(ddx));
      mMid.data[q + 3] = 255 * sstep(0.12, 0.62, z);
      mFar.data[q + 3] = 255 * sstep(0.8, 1.55, z);

      // ── halation above the limb ──
      let ha = 0, hr = 0, hg = 0, hb = 0;
      if (d < 6) {
        const od = d > 0 ? 0 : -d, t = sstep(0, 54, od);
        ha = (0.6 * Math.exp(-od / (11 * tk)) + 0.28 * Math.exp(-od / (46 * tk)) + 0.1 * Math.exp(-od / (120 * tk))) * (1 - sstep(TOP - 80, TOP - 10, od));
        hr = 255 - 13 * t; hg = 126 - 64 * t; hb = 30 - 8 * t;
      }
      if (d < -6) { o[q] = hr; o[q + 1] = hg; o[q + 2] = hb; o[q + 3] = 255 * ha; continue; }

      let fu = Math.atan2(ddx, fcy - y) * RF;
      fu += 26 * nA.n2(fu / 620, fv / 380) + 4 * nA.n2(fu / 170 + 9, fv / 300);    // fibres wander a little
      // ── charred floss: bundles, single fibres, clumps (all soft: this is out-of-focus macro) ──
      const bun = nA.ridged(fu / 64, fv / 980, 2);
      const fine = nB.ridged(fu / 19, fv / 460, 2);
      const clump = nA.fbm(fu / 250 + 5, fv / 1400, 2) * 0.5 + 0.5;
      const h = L.clamp(0.46 * bun + 0.3 * fine + 0.24 * clump);
      const gap = 1 - sstep(0.3, 0.5, h);                           // the slots between fibres: the fire shows through them
      // ── where it is still burning: big patches, and more of it toward the top ──
      const heat = nC.fbm(U / 380, d / 280, 3) * 0.5 + 0.5;
      const topB = Math.exp(-dd / 380);
      const hotv = sstep(0.46, 0.8, heat * 0.82 + topB * 0.4);
      // ── grains of fire: the slots broken up lengthwise, plus tall cells lit one by one ──
      const seg = sstep(0, 0.5, nA.n2(fu / 24 + 50, fv / 150 - 20));
      const c2 = nB.cell(fu / 46 - 7, fv / 190 + 2);
      const p2 = 0.008 + 0.11 * hotv, k2 = 0.5 + 0.5 * ((c2.id * 53.3) % 1);
      const g2 = (1 - sstep(0.05, 0.4, c2.d)) * sstep(0, 0.06, p2 - c2.id) * k2;
      // ── ash: a thin pale frosting that clings to the fibres, low on the dome ──
      const fil = nB.ridged(fu / 10 + 77, fv / 320, 2);
      let tuft = 0;
      for (const t of ASH) { const du = (U - t[0]) / t[2], dv = (d - t[1]) / t[3]; tuft = Math.max(tuft, Math.exp(-du * du - dv * dv)); }
      const ashN = 0.2 + 0.52 * tuft + 0.2 * nC.fbm(fu / 240 + 11, fv / 800 - 5, 3) + 0.36 * (fine - 0.5) + 0.3 * (fil - 0.5) - 0.12 * hotv;
      const ash = sstep(0.5, 0.72, ashN) * sstep(120, 280, d);
      let e = Math.max(g2 * 0.6, gap * seg * hotv * 0.3) * sstep(40, 110, d) * (0.25 + 0.75 * Math.exp(-dd / 480));
      e *= 1 - 0.8 * ash;

      // char, warmed by the fire around it
      let r = 22 + 42 * h, g = 5 + 8 * h, b = 7 + 10 * h;
      const amb = (0.2 + 0.8 * h) * (0.32 * topB + 0.3 * hotv);
      r += 80 * amb; g += 8 * amb; b += 10 * amb;
      let m = Math.exp(-dd / (190 * tk)) * 0.44 * (0.6 + 0.4 * h);
      r += (120 - r) * m; g += (18 - g) * m; b += (19 - b) * m;
      if (ash > 0.01) {
        const la = (0.56 + 0.24 * topB) * (0.5 + 0.5 * L.clamp(0.1 + 0.6 * fine + 0.6 * fil));
        m = ash * 0.66;
        r += (214 * la - r) * m; g += (158 * la - g) * m; b += (128 * la - b) * m;     // 艾灰, seen by firelight
      }
      // the fire seen through the gaps
      const ei = Math.min(256, (e * 256) | 0) * 3;
      r += EM[ei]; g += EM[ei + 1]; b += EM[ei + 2];
      // the terminator: crimson → 炽橙 right on the line
      m = Math.exp(-dd / (76 * tk)) * 0.9 * (0.72 + 0.28 * h);
      r += (208 - r) * m; g += (30 - g) * m; b += (27 - b) * m;
      m = Math.exp(-dd / (12 * tk)) * 0.92;
      r += (255 - r) * m; g += (124 - g) * m; b += (30 - b) * m;
      // the dome turns away toward the lens and toward the sides
      const sh = L.lerp(1, 0.42, sstep(150, 800, d)) * (1 - 0.22 * sstep(600, 1250, Math.abs(ddx)));
      r *= sh; g *= sh; b *= sh;
      // surface over halation across the last few pixels of the limb
      const as = sstep(-5, 5, d), oa = as + (1 - as) * ha;
      o[q] = (r * as + hr * ha * (1 - as)) / oa; o[q + 1] = (g * as + hg * ha * (1 - as)) / oa; o[q + 2] = (b * as + hb * ha * (1 - as)) / oa;
      o[q + 3] = 255 * oa;
      hotMap[k] = (0.25 + 0.75 * hotv) * (1 - 0.85 * ash) * (0.4 + 0.6 * gap) * sstep(20, 50, d);
    }
  }
  const up = (im, blur) => {
    const s = L.makeCanvas(cw, ch); s.getContext('2d').putImageData(im, 0, 0);
    const c = L.makeCanvas(FW, FH), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.filter = `blur(${blur}px)`; g.drawImage(s, 0, 0, FW, FH); g.filter = 'none';
    return c;
  };
  const c = up(img, 2.4), g = c.getContext('2d');          // nothing in this shot is truly sharp
  // shallow depth of field
  for (const [im, px] of [[mMid, 10], [mFar, 22]]) {
    const soft = L.blurred(c, px), sg = soft.getContext('2d');
    sg.globalCompositeOperation = 'destination-in';
    sg.drawImage(up(im, 6), 0, 0);
    g.drawImage(soft, 0, 0);
  }
  // bloom source: only the hot parts, quarter size, blurred wide
  const bw = Math.ceil(FW / 4), bh = Math.ceil(FH / 4);
  const bloom = L.makeCanvas(bw, bh), bg = bloom.getContext('2d');
  bg.filter = 'brightness(0.7) contrast(3) saturate(1.2) blur(6px)';
  bg.drawImage(c, 0, 0, bw, bh);
  bg.filter = 'none';

  // ── glints: placed where the baked surface is actually glowing ──
  const rp = L.rng('s20pts'), pts = [];
  const span = a.span(PAD - 10);
  const hotAt = (p) => {
    const i = Math.floor((p.x - X0) * RES), j = Math.floor((p.y - Y0) * RES);
    return i < 0 || j < 0 || i >= cw || j >= ch ? -1 : hotMap[j * cw + i];
  };
  const fan = (p) => Math.atan2(p.x - cx, fcy - p.y);
  let guard = 0;
  // thin streaks in the band under the limb
  while (pts.length < 46 && guard++ < 20000) {
    const th = rp.range(-span, span), d = 70 + 300 * Math.pow(rp(), 1.7);
    const p = a.pt(th, -d), hv = hotAt(p);
    if (hv < 0 || rp() > 0.04 + hv * 0.9) continue;
    const w = rp.range(12, 20) + Math.abs(d - 150) * 0.03 + Math.abs(p.x - cx) * 0.008;
    pts.push({ x: p.x, y: p.y, w, h: Math.min(w * rp.range(5.5, 8), (d - 30) * 2), ang: fan(p), kind: rp() < 0.25 ? 0 : rp() < 0.6 ? 1 : 2,
      b: rp.range(0.25, 0.7) * Math.exp(-d / 520), ph: rp.range(0, 6.28), sp: rp.range(0.7, 1.9) });
  }
  // a handful of hero glints: bigger, hotter, in the focus band, well apart
  guard = 0;
  for (let n = 0; n < 6 && guard < 4000;) {
    guard++;
    const th = rp.range(-span * 0.9, span * 0.9), d = rp.range(105, 270);
    const p = a.pt(th, -d);
    if (hotAt(p) < 0.3) continue;
    if (pts.some((s) => s.hero && Math.abs(s.x - p.x) < 190)) continue;
    const w = rp.range(22, 30);
    pts.push({ x: p.x, y: p.y, w, h: w * rp.range(5, 6.4), ang: fan(p), kind: 0, b: rp.range(0.85, 1), ph: rp.range(0, 6.28), sp: rp.range(0.7, 1.5), hero: true });
    n++;
  }
  // a few big, melted ovals down in the out-of-focus crown
  for (let n = 0; n < 12; n++) {
    const th = rp.range(-span, span), d = rp.range(390, 720);
    const p = a.pt(th, -d), w = rp.range(34, 70);
    if (p.y > H + 60) continue;
    pts.push({ x: p.x, y: p.y, w, h: w * rp.range(2.4, 3.2), ang: fan(p), kind: 3, b: rp.range(0.1, 0.22), ph: rp.range(0, 6.28), sp: rp.range(0.5, 1.2) });
  }
  return { c, x: X0, y: Y0, w: FW, h: FH, bloom, pts };
}

/** the glints: a small hot dot trailing a faint vertical smear, and one flat oval for the far-out-of-focus ones */
function buildSprites() {
  const streak = (core, body) => {
    const c = L.makeCanvas(40, 240), g = c.getContext('2d');
    g.save(); g.translate(20, 120); g.scale(1, 6);
    g.fillStyle = L.radial(g, 0, 0, 0, 20, [[0, L.rgba(body, 0.5)], [0.5, L.rgba(body, 0.2)], [1, L.rgba(body, 0)]]);
    g.fillRect(-20, -20, 40, 40);
    g.restore();
    g.globalCompositeOperation = 'lighter';
    g.translate(20, 92); g.scale(1, 1.9);
    g.fillStyle = L.radial(g, 0, 0, 0, 15, [[0, core], [0.4, L.rgba(core, 0.5)], [1, L.rgba(core, 0)]]);
    g.fillRect(-20, -20, 40, 40);
    return c;
  };
  const oval = () => {
    const c = L.makeCanvas(96, 240), g = c.getContext('2d');
    g.translate(48, 120); g.scale(1, 2.5);
    g.fillStyle = L.radial(g, 0, 0, 0, 48, [[0, 'rgba(214,62,24,0.8)'], [0.6, 'rgba(204,54,22,0.7)'], [0.86, 'rgba(170,36,16,0.34)'], [1, 'rgba(150,24,14,0)']]);
    g.fillRect(-48, -48, 96, 96);
    return c;
  };
  return [
    streak('rgb(255,184,96)', 'rgb(255,132,40)'),     // hot core
    streak('rgb(255,146,52)', 'rgb(246,108,30)'),      // 炽橙
    streak('rgb(236,96,34)', 'rgb(206,62,24)'),       // dull red
    oval(),
  ];
}

export default {
  name: '艾灸火头',
  tone: 'light',
  init(env) {
    S = { back: buildBack(env), smoke: [buildSmoke(env, -1), buildSmoke(env, 1)], ember: buildEmber(env), spr: buildSprites() };
  },
  draw(ctx, env, p) {
    const f = env.frame | 0, E = S.ember;
    const zoom = L.lerp(0.996, 1.014, p);                // a breath of push-in, centred so the arc never strays
    const pulse = 0.5 + 0.5 * Math.sin(f * 1.25 + 0.6);  // the ember breathes

    L.blit(ctx, env, S.back, { zoom: 1 + (zoom - 1) * 0.4 });

    // smoke: one thread far out on each side, rising
    L.cam(ctx, env, { zoom: 1 + (zoom - 1) * 0.7, dy: -24 * p }, () => { for (const s of S.smoke) ctx.drawImage(s.c, s.x, s.y); });

    L.cam(ctx, env, { zoom }, () => {
      ctx.drawImage(E.c, E.x, E.y);
      // glints: flicker is seeded by the frame number
      const r = L.rng('s20tw' + f);
      ctx.globalCompositeOperation = 'lighter';
      for (const q of E.pts) {
        const tw = 0.55 * (0.5 + 0.5 * Math.sin(q.ph + f * q.sp)) + 0.45 * r();
        const al = q.b * (0.3 + 0.7 * tw);
        if (al < 0.02) continue;
        const sz = 0.92 + 0.16 * tw;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang);
        ctx.globalAlpha = Math.min(1, al);
        ctx.drawImage(S.spr[q.kind], -q.w * sz * 0.5, -q.h * sz * 0.5, q.w * sz, q.h * sz);
        ctx.restore();
      }
      ctx.globalAlpha = 0.3 + 0.1 * pulse; ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(E.bloom, E.x, E.y, E.w, E.h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });

    L.vignette(ctx, { strength: 0.14, color: '#1a0403', inner: 0.55, outer: 1.1 });
  },
};
