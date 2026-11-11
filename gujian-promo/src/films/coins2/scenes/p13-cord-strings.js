// p13 — 彩绳钱串: little bundles of cash coins tied with coloured cord (red / blue / yellow / green), photographed from above on
// grey-white paper (the reference's page of small flags). Twelve fanned bundles hug the outer circle and eight line the four sides
// of the square hole, so the page spells the coin glyph — its first full appearance, registered to K.GLYPH.
// Every coin is drawn where it lies (rim / field / inner rim shaded for a top-left light in PAGE space), cords are twisted ropes.
import * as L from '../../../lib/core.js';
import * as K from '../../../lib/plate.js';
const { S } = K;
const TAU = Math.PI * 2;
const G = K.GLYPH;
let layer = null;

//            light      base       dark       field (recess)
const COIN = [
  ['#ecd08a', '#b9933f', '#6a4e1d', '#4d3a14'],     // brass
  ['#d3ab6c', '#96723a', '#553c1a', '#3c2b12'],     // old bronze
  ['#bda071', '#806639', '#47341a', '#2f2311'],     // dark, handled
  ['#deab7a', '#a9713f', '#5f3b1d', '#44290f'],     // reddish copper
];
const CORD = [
  ['#f47a62', '#cb2a20', '#76110e'],                // red
  ['#74a4dc', '#2b5eaa', '#122d60'],                // blue
  ['#f8df80', '#e2ac1e', '#8c5f07'],                // yellow
  ['#80c890', '#2f8b4d', '#134e29'],                // green
];
const LX = -0.7071, LY = -0.7071;                    // toward the light

function sqPath(g, h, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([x, y], i) => { const X = x * c - y * s, Y = x * s + y * c; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  g.closePath();
}
const bodyPath = (g, R, h, rot) => { g.beginPath(); g.arc(0, 0, R, 0, TAU); sqPath(g, h, rot); };

function drawCoin(g, c, tex) {
  const { x, y, R, rot, pal } = c; const r = L.rng('p13c' + c.seed);
  const h = R * 0.2, q = R * 0.3, rf = R * 0.83;
  const lg = (a, b) => L.linear(g, LX * -R * -1, LY * -R * -1, -LX * R, -LY * R, [[0, a], [0.5, 'rgba(120,100,60,0)'], [1, b]]);
  g.save(); g.translate(x, y);
  // contact shadow (page space)
  g.save(); g.shadowColor = 'rgba(30,19,8,0.58)'; g.shadowBlur = 6; g.shadowOffsetX = 2.6; g.shadowOffsetY = 4.2;
  bodyPath(g, R, h, rot); g.fillStyle = pal[1]; g.fill('evenodd'); g.restore();
  g.save(); bodyPath(g, R, h, rot); g.clip('evenodd');
  g.fillStyle = L.linear(g, -R * 0.75, -R * 0.75, R * 0.75, R * 0.75, [[0, pal[0]], [0.48, pal[1]], [1, pal[2]]]); g.fillRect(-R, -R, 2 * R, 2 * R);
  // patina: mottled tone, rotated with the coin
  g.save(); g.rotate(rot + r() * TAU); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.78;
  g.drawImage(tex, -r.range(R + 2, tex.width - R - 2), -r.range(R + 2, tex.height - R - 2)); g.restore();
  // recessed field between the outer rim and the inner rim
  g.beginPath(); g.arc(0, 0, rf, 0, TAU); sqPath(g, q, rot); g.fillStyle = L.rgba(pal[3], 0.46); g.fill('evenodd');
  // the worn-flat ghosts of the four characters: soft polished lumps, nothing legible
  for (let k = 0; k < 4; k++) {
    const a = rot + k * Math.PI / 2 + r.range(-0.08, 0.08), d = (q + rf) * 0.5 + r.range(-1, 1), bx = Math.cos(a) * d, by = Math.sin(a) * d, br = R * r.range(0.16, 0.22);
    g.fillStyle = L.radial(g, bx - 1, by - 1, 0, br, [[0, L.rgba(pal[0], r.range(0.22, 0.4))], [0.6, L.rgba(pal[0], 0.1)], [1, L.rgba(pal[0], 0)]]);
    g.beginPath(); g.ellipse(bx, by, br, br * r.range(0.7, 1), a, 0, TAU); g.fill();
    g.fillStyle = L.rgba(pal[3], 0.3); g.beginPath(); g.ellipse(bx + 1.6, by + 1.8, br * 0.5, br * 0.22, a + 0.6, 0, TAU); g.fill();
  }
  // verdigris and dirt gathered in the recesses
  for (let k = 0, n = r.int(1, 4); k < n; k++) {
    const a = r() * TAU, d = r.chance(0.6) ? rf - r.range(1, 5) : q + r.range(0.5, 4), bx = Math.cos(a) * d, by = Math.sin(a) * d, br = r.range(2.5, 7);
    g.fillStyle = L.radial(g, bx, by, 0, br, [[0, `rgba(88,150,128,${r.range(0.4, 0.7)})`], [0.55, 'rgba(70,128,108,0.22)'], [1, 'rgba(70,128,108,0)']]);
    g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
    for (let m = 0; m < 5; m++) { g.fillStyle = `rgba(150,196,170,${r.range(0.35, 0.7)})`; g.beginPath(); g.arc(bx + r.range(-br, br) * 0.7, by + r.range(-br, br) * 0.7, r.range(0.4, 0.9), 0, TAU); g.fill(); }
  }
  // rim: shadow it throws onto the field (top-left), light caught by its far inner wall (bottom-right)
  g.lineWidth = 3.2; g.strokeStyle = lg('rgba(28,18,6,0.62)', L.rgba(pal[0], 0.5)); g.beginPath(); g.arc(0, 0, rf - 1.4, 0, TAU); g.stroke();
  g.lineWidth = (R - rf) * 0.6; g.strokeStyle = lg(L.rgba('#fff3cf', 0.5), 'rgba(40,26,10,0.16)'); g.beginPath(); g.arc(0, 0, (R + rf) * 0.5, 0, TAU); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = lg('rgba(255,246,214,0.9)', 'rgba(30,18,6,0.8)'); g.beginPath(); g.arc(0, 0, R - 0.8, 0, TAU); g.stroke();
  // specular glint where the polished rim turns to the light
  g.lineCap = 'round'; g.lineWidth = 1.7; g.strokeStyle = 'rgba(255,250,228,0.62)'; g.beginPath(); g.arc(0, 0, (R + rf) * 0.5 + 0.6, Math.PI * (1.25 - r.range(0.1, 0.17)), Math.PI * (1.25 + r.range(0.06, 0.15))); g.stroke();
  g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,250,228,0.4)'; g.beginPath(); g.arc(0, 0, (R + rf) * 0.5 - 1.2, Math.PI * 1.02, Math.PI * 1.5); g.stroke(); g.lineCap = 'butt';
  // inner rim round the hole: top face, then each side lit by its own normal
  g.beginPath(); sqPath(g, q, rot); sqPath(g, h, rot); g.fillStyle = L.rgba(pal[0], 0.24); g.fill('evenodd');
  g.lineWidth = 1.25; g.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const a = rot + k * Math.PI / 2, nx = Math.cos(a), ny = Math.sin(a), b = nx * LX + ny * LY;
    const side = (d, col) => { g.strokeStyle = col; g.beginPath(); g.moveTo(nx * d + ny * d, ny * d - nx * d); g.lineTo(nx * d - ny * d, ny * d + nx * d); g.stroke(); };
    side(q, b > 0 ? `rgba(255,244,208,${0.2 + b * 0.6})` : `rgba(26,16,6,${0.2 - b * 0.55})`);
    side(h + 0.5, b > 0 ? `rgba(22,13,5,${0.25 + b * 0.5})` : `rgba(255,240,200,${0.15 - b * 0.5})`);
  }
  // micro: hairline scratches and casting pits
  for (let k = 0, n = r.int(7, 12); k < n; k++) {
    const a = r() * TAU, d = r.range(0, R * 0.85), sx = Math.cos(a) * d, sy = Math.sin(a) * d, sa = r() * TAU, sl = r.range(4, 15);
    g.lineWidth = r.range(0.5, 0.9); g.strokeStyle = r.chance(0.6) ? `rgba(255,243,206,${r.range(0.18, 0.4)})` : `rgba(30,19,7,${r.range(0.15, 0.32)})`;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(sa) * sl, sy + Math.sin(sa) * sl); g.stroke();
  }
  for (let k = 0, n = r.int(8, 15); k < n; k++) {
    const a = r() * TAU, d = r.range(q, R * 0.95), px = Math.cos(a) * d, py = Math.sin(a) * d, pr = r.range(0.5, 1.2);
    g.fillStyle = `rgba(26,16,6,${r.range(0.35, 0.65)})`; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,240,200,0.4)'; g.beginPath(); g.arc(px + pr * 0.7, py + pr * 0.7, pr * 0.5, 0, TAU); g.fill();
  }
  g.restore(); g.restore();
}

/** a twisted cord along a dense polyline */
function rope(g, pts, w, col, shadow = 1) {
  const path = (dx = 0, dy = 0) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy))); };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.shadowColor = `rgba(26,15,6,${0.6 * shadow})`; g.shadowBlur = 3.4; g.shadowOffsetX = 1.7; g.shadowOffsetY = 2.7;
  path(); g.strokeStyle = col[2]; g.lineWidth = w; g.stroke(); g.restore();
  path(-0.35, -0.45); g.strokeStyle = col[1]; g.lineWidth = w - 1.5; g.stroke();
  path(-w * 0.2, -w * 0.24); g.strokeStyle = L.rgba(col[0], 0.75); g.lineWidth = w * 0.3; g.stroke();
  // the twist: short slanted nicks every ply
  g.lineWidth = 0.95; g.lineCap = 'butt';
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy) || 1; acc += len;
    if (acc < w * 0.72) continue; acc = 0;
    const tx = dx / len, ty = dy / len, nx = -ty, ny = tx, hw = w * 0.44, sl = w * 0.3, px = pts[i][0], py = pts[i][1];
    g.strokeStyle = L.rgba(col[2], 0.62); g.beginPath(); g.moveTo(px - nx * hw - tx * sl, py - ny * hw - ty * sl); g.lineTo(px + nx * hw + tx * sl, py + ny * hw + ty * sl); g.stroke();
    g.strokeStyle = L.rgba(col[0], 0.34); g.beginPath(); g.moveTo(px - nx * hw * 0.5 - tx * sl + tx * 1.3, py - ny * hw * 0.5 - ty * sl + ty * 1.3); g.lineTo(px + nx * hw * 0.2 + tx * 1.3, py + ny * hw * 0.2 + ty * 1.3); g.stroke();
  }
  g.restore();
}
const seg = (a, b, n = 12) => { const o = []; for (let i = 0; i <= n; i++) o.push([L.lerp(a[0], b[0], i / n), L.lerp(a[1], b[1], i / n)]); return o; };
const quad = (a, c, b, n = 22) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; };

function drawCord(g, b) {
  const P = b.coins, n = P.length, col = b.col, r = L.rng('p13k' + b.seed), w = 5.2;
  let tx = P[1].x - P[0].x, ty = P[1].y - P[0].y; const s = Math.hypot(tx, ty); tx /= s; ty /= s;
  let nx = -ty, ny = tx; if (nx * b.gx + ny * b.gy < 0) { nx = -nx; ny = -ny; }        // n̂ points to the gap side
  const kx = P[1].x + tx * (s / 2 - P[1].R), ky = P[1].y + ty * (s / 2 - P[1].R);        // middle of the second coin's exposed crescent
  const top = P[n - 1];
  // cords lying on the coins: clipped to the bundle (they pass round underneath)
  g.save(); g.beginPath(); for (const c of P) { g.moveTo(c.x + c.R, c.y); g.arc(c.x, c.y, c.R - 0.3, 0, TAU); } g.clip();
  // threaded through the square hole of the top coin and back along the stack
  const mid = [(kx + top.x) / 2 + nx * r.range(-3, 3), (ky + top.y) / 2 + ny * r.range(-3, 3)];
  rope(g, quad([P[0].x - tx * (P[0].R + 4), P[0].y - ty * (P[0].R + 4)], [kx, ky], mid, 14).concat(seg(mid, [top.x, top.y], 12).slice(1)), w, col);
  // three turns lashed across the stack
  const R0 = P[0].R + 8;
  for (let m = -1; m <= 1; m++) {
    const ox = kx + tx * m * (w + 0.3), oy = ky + ty * m * (w + 0.3), bow = r.range(-2.5, -0.5);
    rope(g, quad([ox - nx * R0, oy - ny * R0], [ox + tx * bow, oy + ty * bow], [ox + nx * R0, oy + ny * R0], 20), w, col, 0.8);
  }
  g.restore();
  // the cord drops into the hole: darken its far end
  g.fillStyle = 'rgba(20,12,5,0.5)'; g.beginPath(); g.arc(top.x + tx * 2, top.y + ty * 2, top.R * 0.13, 0, TAU); g.fill();
  // two loose ends from the knot, lying out over the edge onto the paper
  for (let m = 0; m < 2; m++) {
    const a = (m ? 1 : -1) * r.range(0.22, 0.62), ca = Math.cos(a), sa = Math.sin(a), dx = nx * ca - ny * sa, dy = nx * sa + ny * ca, len = r.range(56, 74);
    const bend = r.range(-14, 14), end = [kx + dx * len, ky + dy * len], ctl = [kx + dx * len * 0.5 - dy * bend, ky + dy * len * 0.5 + dx * bend];
    const pts = quad([kx, ky], ctl, end, 24); rope(g, pts, w * 0.92, col);
    // frayed tip
    const q = pts[pts.length - 3], ex = end[0] - q[0], ey = end[1] - q[1], ea = Math.atan2(ey, ex);
    g.save(); g.lineCap = 'round';
    for (let f = 0; f < 7; f++) {
      const fa = ea + r.range(-0.5, 0.5), fl = r.range(6, 12);
      g.strokeStyle = L.rgba(col[f % 3 === 0 ? 0 : f % 3 === 1 ? 1 : 2], 0.9); g.lineWidth = r.range(0.7, 1.2);
      g.beginPath(); g.moveTo(end[0] + r.range(-1.5, 1.5), end[1] + r.range(-1.5, 1.5)); g.quadraticCurveTo(end[0] + Math.cos(fa) * fl * 0.5 + r.range(-1.5, 1.5), end[1] + Math.sin(fa) * fl * 0.5 + r.range(-1.5, 1.5), end[0] + Math.cos(fa) * fl, end[1] + Math.sin(fa) * fl); g.stroke();
    }
    // a binding thread just before the fray
    g.strokeStyle = L.rgba(col[2], 0.85); g.lineWidth = 1.6; g.beginPath(); g.moveTo(q[0] - Math.sin(ea) * 2.6, q[1] + Math.cos(ea) * 2.6); g.lineTo(q[0] + Math.sin(ea) * 2.6, q[1] - Math.cos(ea) * 2.6); g.stroke();
    g.restore();
  }
  // the knot
  g.save(); g.shadowColor = 'rgba(26,15,6,0.6)'; g.shadowBlur = 3.5; g.shadowOffsetX = 1.8; g.shadowOffsetY = 2.8;
  g.translate(kx + nx * 2, ky + ny * 2); g.rotate(Math.atan2(ny, nx));
  g.fillStyle = L.radial(g, -1.6, -1.8, 0.5, 8.5, [[0, col[0]], [0.45, col[1]], [1, col[2]]]);
  g.beginPath(); g.ellipse(0, 0, 7.6, 6.2, 0, 0, TAU); g.fill(); g.restore();
  g.save(); g.translate(kx + nx * 2, ky + ny * 2); g.rotate(Math.atan2(ny, nx)); g.lineCap = 'round';
  g.strokeStyle = L.rgba(col[2], 0.75); g.lineWidth = 1.1;
  for (const o of [-2.6, 0.4, 3.2]) { g.beginPath(); g.moveTo(o - 1.8, -5); g.quadraticCurveTo(o + 1.6, 0, o - 1.2, 5); g.stroke(); }
  g.strokeStyle = L.rgba(col[0], 0.6); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-4.6, -2.6); g.quadraticCurveTo(-1, -4.6, 2.6, -3.4); g.stroke();
  g.restore();
}

function bundles() {
  const r = L.rng('p13lay'), out = [];
  const coin = (x, y, R) => ({ x, y, R, rot: r.range(-0.3, 0.3) + (r.chance(0.12) ? r.range(-0.35, 0.35) : 0), pal: COIN[r.chance(0.4) ? 0 : r.int(1, 3)], seed: out.length + '_' + Math.round(x) + '_' + Math.round(y) });
  // outer ring: 12 bundles of 4, fanned along the circle, every coin's edge on the circle
  const NB = 12, n = 4, R0 = 40, per = TAU / NB, rr = G.R - R0, s = (per * rr - 2 * R0 - 4) / (n - 1), dth = s / rr;
  const ringCol = [0, 1, 2, 0, 3, 1, 0, 2, 3, 0, 1, 3];
  for (let i = 0; i < NB; i++) {
    const th0 = -Math.PI / 2 + 0.11 + i * per - ((n - 1) / 2) * dth, coins = [];
    for (let k = 0; k < n; k++) {
      const Rc = R0 + r.range(-2.2, 0.6), rad = G.R - Rc - r.range(0, 1.1), th = th0 + k * dth + r.range(-0.005, 0.005);
      coins.push(coin(G.cx + Math.cos(th) * rad, G.cy + Math.sin(th) * rad, Rc));
    }
    out.push({ coins, gx: G.cx - coins[1].x, gy: G.cy - coins[1].y, col: CORD[ringCol[i]], seed: 'r' + i });
  }
  // square hole: 2 bundles of 4 per side, pin-wheeled so each corner holds a full coin; every coin's edge on the hole's side
  const Q0 = 36, ds = G.a + Q0, gapS = 6, span = 2 * ds - 2 * Q0 - gapS, sS = (span - (2 * Q0 + gapS)) / (2 * (n - 1));
  const sides = [[1, 0, 0, -1], [0, 1, 1, 0], [-1, 0, 0, 1], [0, -1, -1, 0]];          // direction along the side, outward normal
  const sqCol = [2, 0, 3, 1, 0, 2, 1, 3];
  sides.forEach(([dx, dy, nx, ny], si) => {
    for (let j = 0; j < 2; j++) {
      const u0 = j * ((n - 1) * sS + 2 * Q0 + gapS), coins = [];
      for (let k = n - 1; k >= 0; k--) {
        const Rc = Q0 + r.range(-1.6, 1.0), dn = G.a + Rc + r.range(0, 0.9), al = (j === 0 && k === 0 ? -(G.a + Rc) : -ds + u0 + k * sS + r.range(-0.8, 0.8));
        coins.push(coin(G.cx + dx * al + nx * dn, G.cy + dy * al + ny * dn, Rc));
      }
      out.push({ coins, gx: nx, gy: ny, col: CORD[sqCol[si * 2 + j]], seed: 's' + si + j });
    }
  });
  return out;
}

function build() {
  const c = L.makeCanvas(S, S), g = c.getContext('2d');
  g.drawImage(K.paper({ base: '#e9e7df', tone: '#6e685a', seed: 'p13paper', fiber: 0.65, stain: 0.2, foxing: 0.06, edge: 0.14 }), 0, 0);
  const tex = L.noiseTex(280, 280, { seed: 'p13pat', scale: 34, octaves: 5, res: 1, contrast: 1.5, ramp: [[0, '#84735a'], [0.5, '#d9cfb9'], [1, '#ffffff']] });
  const B = bundles();
  // broad soft shadow each bundle throws on the paper
  g.save(); g.shadowColor = 'rgba(46,34,20,0.30)'; g.shadowBlur = 18; g.shadowOffsetX = 7; g.shadowOffsetY = 11; g.fillStyle = '#8a7a5a';
  for (const b of B) for (const k of b.coins) { g.beginPath(); g.arc(k.x, k.y, k.R - 2, 0, TAU); g.fill(); }
  g.restore();
  for (const b of B) for (const k of b.coins) drawCoin(g, k, tex);
  for (const b of B) drawCord(g, b);
  return c;
}

export default {
  name: '彩绳钱串',
  init() { layer = build(); },
  draw(ctx, env, p) {
    K.drift(ctx, layer, p, { z0: 1.012, z1: 1.0 });        // settles exactly onto the glyph for the flash-cuts that follow
  },
};
