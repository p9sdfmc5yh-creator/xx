// s37 — 祈年殿檐下. The film's last five frames: we stand under the lowest round eave of the Hall of Prayer for Good
// Harvests at night, a long lens pointed up at a short stretch of the eave edge. The arc is the eave edge (檐口): a
// fringe of blue-glazed tile ends (瓦当) and drip tiles (滴水) catching the warm floodlight. Below it the vermilion
// rafters fan inward toward the hall's centre like the gills of a mushroom: square flying rafters (飞椽, green heads
// with a gold pearl) over round eave rafters (檐椽, blue heads with a gold pearl); deep inside, out of focus, the eave
// purlin and the blue/green/gold bracket ring. Above: night.
//
// Everything is baked into one picture in init (sky + eave + depth of field + bloom); draw is a single blit.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 64;          // the move is tiny (5 frames), so the layer needs very little margin
const WAN = false;       // true → flying-rafter heads carry the gold 卍 as restored on the hall; false → a plain gold pearl (default: the 0.2 s shot is too short for the symbol to read correctly out of context)
const PITCH = 104;       // rafter spacing along the eave edge (px)
const TILE = 94;         // tile spacing along the eave edge (px)
const FLY_HW = 29;       // half-width of a (square) flying rafter
const EAVE_HW = 26;      // half-width of a (round) eave rafter
// radial layout: px inward from the eave edge (local +y of arc.at points to the circle centre)
const Y = {
  lian0: 16, lian1: 62,          // 大连檐 / 瓦口: the red board behind the tile fringe
  head: 40,                      // foreshortened height of a rafter's end face
  fly0: 104, fly1: 292,          // flying rafter underside (its inner end disappears behind the eave rafter's head)
  xiao0: 238, xiao1: 270,        // 小连檐 + 闸挡板: the boards between the flying rafters where the two tiers meet
  eave0: 292, eave1: 456,        // eave rafter (centre of its head disc → where it dives behind the purlin)
  pur0: 442, pur1: 500,          // 挑檐桁: the eave purlin
  dg0: 500,                      // bracket band starts here
};
const C = {
  red: '#d2371f', hi: '#ff7a4a', lo: '#6a120c',
  blue: '#1f3f96', green: '#1f8f6a', gold: '#e9b949', night: '#05070c',
};
let S = null;

const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
const ell = (g, x, y, rx, ry, a0 = 0, a1 = L.TAU) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, a0, a1); };

/** evenly spaced angles covering the frame + PAD; `pitch` px at radius R+dr, `off` in pitches */
function angles(a, pitch, dr = 0, off = 0) {
  const s = a.span(PAD + 260);
  const step = pitch / (a.R + dr);
  const n = Math.ceil(s / step) + 1;
  const out = [];
  for (let i = -n; i <= n; i++) out.push({ th: (i + off) * step, i });
  return out;
}

/** paint something over a layer but only where the layer already has pixels (keeps the sky transparent) */
function overlay(layer, blend, alpha, paint) {
  const t = L.makeLayer(PAD, paint);
  const tg = t.getContext('2d');
  tg.setTransform(1, 0, 0, 1, 0, 0);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(layer, 0, 0);
  const g = layer.getContext('2d');
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = blend; g.globalAlpha = alpha;
  g.drawImage(t, 0, 0);
  g.restore();
}

/** every rafter takes the paint a little differently: q.hue leans it toward orange (+) or crimson (−), q.tone lifts / drops it */
function tint(c, q) {
  const m = q.hue >= 0 ? L.mix(c, '#ff6a1c', q.hue * 0.3) : L.mix(c, '#b40f1e', -q.hue * 0.3);
  return L.shade(m, q.tone);
}

/** drying checks running along the grain of a rafter of half-width hw, between y0 and y1 */
function checks(g, r, hw, y0, y1) {
  const n = r.int(0, 2);
  for (let k = 0; k < n; k++) {
    const x = r.range(-hw * 0.7, hw * 0.7), ya = r.range(y0 + 10, y1 - 70), len = r.range(34, 100), w = r.range(-2.6, 2.6);
    const path = (o) => { g.beginPath(); g.moveTo(x + o, ya); g.bezierCurveTo(x + w + o, ya + len * 0.3, x - w * 0.6 + o, ya + len * 0.7, x + w * 0.4 + o, ya + len); g.stroke(); };
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(64,7,3,0.6)'; g.lineWidth = r.range(1, 1.7); path(0);
    g.strokeStyle = 'rgba(255,178,136,0.3)'; g.lineWidth = 1; path(1.4);
  }
}

/** a flake of paint gone from an arris, showing the paler ground underneath */
function chips(g, r, hw, y0, y1) {
  if (!r.chance(0.55)) return;
  const n = r.int(1, 2);
  for (let k = 0; k < n; k++) {
    const side = r.sign(), cx = side * (hw - r.range(0.5, 4)), cy = r.range(y0 + 14, y1 - 14), rx = r.range(2.4, 6), ry = rx * r.range(1.6, 3.6);
    const pts = [];
    for (let i = 0; i < 7; i++) { const t = (i / 7) * L.TAU, k2 = r.range(0.6, 1.15); pts.push([cx + Math.cos(t) * rx * k2, cy + Math.sin(t) * ry * k2]); }
    g.fillStyle = side < 0 ? 'rgba(255,196,160,0.8)' : 'rgba(120,34,20,0.85)';
    poly(g, pts); g.fill();
  }
}

// ───────────────────────── rafters ─────────────────────────
/** a square flying rafter (飞椽) hanging under the boards. q.s = sideways lean of "up" at this spot (px) */
function flyRafter(g, q, r) {
  const hw = FLY_HW + q.dw, e = Y.head, y0 = Y.fly0, y1 = Y.fly1, s = q.s;
  const t = (c) => tint(c, q);
  // shadow thrown onto the boards (the light rakes in from the lower left): hard at the rafter, then a soft penumbra
  const sx = hw + Math.max(0, s) - 3, sw = 48;
  g.fillStyle = L.linear(g, sx, 0, sx + sw, 0, [[0, 'rgba(14,1,4,0.98)'], [0.5, 'rgba(14,1,4,0.9)'], [1, 'rgba(14,1,4,0)']]);
  g.fillRect(sx, y0 - e, sw, y1 - y0 + e + 6);
  const fall = L.linear(g, 0, y0, 0, y1, [[0, 'rgba(255,216,160,0.2)'], [0.25, 'rgba(255,216,160,0)'], [0.62, 'rgba(20,2,2,0)'], [1, 'rgba(20,2,2,0.3)']]);
  // the one side face we can see
  let side = null;
  if (s > 0.5) {          // right flank, turned away from the light
    side = [[hw, y0], [hw, y1], [hw + s, y1 - e], [hw + s, y0 - e]];
    g.fillStyle = L.linear(g, hw, 0, hw + s, 0, [[0, t('#8a1b0e')], [1, '#2e0714']]);
  } else if (s < -0.5) {  // left flank, facing the light
    side = [[-hw, y0], [-hw, y1], [-hw + s, y1 - e], [-hw + s, y0 - e]];
    g.fillStyle = L.linear(g, -hw + s, 0, -hw, 0, [[0, t('#ffa878')], [1, t('#ff7f4a')]]);
  }
  if (side) { poly(g, side); g.fill(); g.fillStyle = fall; g.fill(); }
  // underside
  g.fillStyle = L.linear(g, -hw, 0, hw, 0, [
    [0, t('#ffb48a')], [0.045, t('#ff7a4a')], [0.2, t('#ee4a27')], [0.6, t('#d83a1f')], [0.9, t('#b82a15')], [1, t('#6a120c')]]);
  g.fillRect(-hw, y0, hw * 2, y1 - y0);
  g.save(); g.beginPath(); g.rect(-hw, y0, hw * 2, y1 - y0); g.clip();
  checks(g, r, hw, y0, y1 - 24);
  chips(g, r, hw, y0, y1 - 30);
  g.fillStyle = fall; g.fillRect(-hw, y0, hw * 2, y1 - y0);
  // the oil paint's sheen: every rafter is turned a hair differently, so each throws the lamp back at a different spot
  g.translate(-hw * 0.18 + q.shx, q.shy); g.scale(1, 3.4);
  g.fillStyle = L.radial(g, 0, 0, 0, hw * 0.95, [[0, `rgba(255,222,184,${q.sha})`], [0.5, `rgba(255,186,138,${q.sha * 0.38})`], [1, 'rgba(255,170,120,0)']]);
  g.fillRect(-hw * 2, -hw, hw * 4, hw * 2);
  g.restore();
  // gloss along the lit arris, broken where the paint has dulled
  g.lineCap = 'round'; g.lineWidth = 2.4;
  for (let yy = y0 + 3; yy < y1 - 36;) {
    const len = r.range(16, 70), k = 1 - (yy - y0) / (y1 - y0);
    g.strokeStyle = `rgba(255,238,208,${(r.range(0.2, 0.95) * k).toFixed(3)})`;
    g.beginPath(); g.moveTo(-hw + 1.7, yy); g.lineTo(-hw + 1.7 + r.range(-0.5, 0.5), yy + len); g.stroke();
    yy += len + r.range(3, 16);
  }
  // end face: green ground, raised gold frame, gold pearl — sheared so it leans the same way as the side face
  g.save(); g.translate(0, y0); g.transform(1, 0, -s / e, 1, 0, 0);
  const G0 = q.grn >= 0 ? L.mix(C.green, '#22a38e', q.grn * 0.5) : L.mix(C.green, '#176a44', -q.grn * 0.6);
  g.fillStyle = L.linear(g, 0, -e, 0, 0, [[0, L.shade(G0, -0.6)], [0.45, G0], [1, L.shade(G0, 0.36)]]);
  g.fillRect(-hw, -e, hw * 2, e);
  const m = 5.5;
  g.lineJoin = 'miter'; g.lineCap = 'butt'; g.lineWidth = 3.2;
  g.strokeStyle = '#a3721a'; g.strokeRect(-hw + m, -e + m, hw * 2 - m * 2, e - m * 2);
  g.strokeStyle = `rgba(255,226,134,${q.gw})`;
  g.beginPath(); g.moveTo(-hw + m, -e + m); g.lineTo(-hw + m, -m); g.lineTo(hw - m, -m); g.stroke();
  const cy = -e / 2 + q.py, cx = q.px;
  if (WAN) {
    const hx = 11, hy = 8.4;
    g.strokeStyle = '#ffd866'; g.lineWidth = 3.4; g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(-hx, cy - hy); g.lineTo(0, cy - hy); g.lineTo(0, cy + hy); g.lineTo(hx, cy + hy);
    g.moveTo(hx, cy - hy); g.lineTo(hx, cy); g.lineTo(-hx, cy); g.lineTo(-hx, cy + hy);
    g.stroke();
  } else {
    g.fillStyle = 'rgba(3,22,14,0.55)'; ell(g, cx + 2.4, cy - 2.2, 9.4, 7.8); g.fill();
    g.fillStyle = L.radial(g, cx - 2.6, cy + 2.4, 0.4, 10.5, [[0, '#fffadd'], [0.32, '#ffd862'], [0.8, '#c88d1c'], [1, '#8f5f0c']]);
    ell(g, cx, cy, 9.2, 7.6); g.fill();
  }
  // the board above shades the top of the face; its lower edge catches the light
  g.fillStyle = L.linear(g, 0, -e, 0, -e + 15, [[0, 'rgba(3,9,7,0.72)'], [1, 'rgba(3,9,7,0)']]); g.fillRect(-hw, -e, hw * 2, 15);
  g.strokeStyle = `rgba(255,244,204,${(0.5 + q.gw * 0.4).toFixed(3)})`; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(-hw, -0.8); g.lineTo(hw, -0.8); g.stroke();
  g.restore();
}

/** a round eave rafter (檐椽) with its painted head */
function eaveRafter(g, q, r) {
  const hw = EAVE_HW + q.dw, y0 = Y.eave0, y1 = Y.eave1, s = q.s;
  const t = (c) => tint(c, q);
  // shadow on the boards
  g.fillStyle = L.linear(g, hw - 4, 0, hw + 44, 0, [[0, 'rgba(14,1,4,0.98)'], [0.5, 'rgba(14,1,4,0.88)'], [1, 'rgba(14,1,4,0)']]);
  g.fillRect(hw - 4, y0 - 12, 48, y1 - y0 + 12);
  // cylinder shading; the highlight wanders with the viewing angle
  const hl = L.clamp(0.26 - s * 0.008 + q.shx * 0.004, 0.1, 0.44);
  g.fillStyle = L.linear(g, -hw, 0, hw, 0, [
    [0, t('#a52311')], [hl * 0.45, t('#f2603a')], [hl, t('#ff9c6c')], [hl + 0.2, t('#e2452b')],
    [0.74, t('#9c1e0e')], [1, '#3d0805']]);
  g.fillRect(-hw, y0, hw * 2, y1 - y0);
  g.save(); g.beginPath(); g.rect(-hw, y0, hw * 2, y1 - y0); g.clip();
  checks(g, r, hw * 0.8, y0 + 24, y1 - 40);
  g.fillStyle = L.linear(g, 0, y0, 0, y1, [[0, 'rgba(255,216,160,0.18)'], [0.3, 'rgba(255,216,160,0)'], [0.55, 'rgba(20,2,2,0)'], [1, 'rgba(20,2,2,0.62)']]);
  g.fillRect(-hw, y0, hw * 2, y1 - y0);
  g.restore();
  // specular streak down the cylinder, broken
  const hx = -hw + hl * hw * 2;
  g.lineCap = 'round'; g.lineWidth = 2.6;
  for (let yy = y0 + 22; yy < y1 - 40;) {
    const len = r.range(20, 64), k = 1 - (yy - y0) / (y1 - y0);
    g.strokeStyle = `rgba(255,240,216,${(r.range(0.12, 0.6) * k).toFixed(3)})`;
    g.beginPath(); g.moveTo(hx, yy); g.lineTo(hx + r.range(-0.6, 0.6), yy + len); g.stroke();
    yy += len + r.range(4, 18);
  }
  // head: blue ground, gold rim, gold pearl
  const ry = 20;
  g.fillStyle = 'rgba(12,1,5,0.7)'; ell(g, 5, y0 - 7, hw + 2.5, ry + 1.5); g.fill();   // thrown up-right onto the flying rafter behind it
  const B0 = L.shade(C.blue, q.grn * 0.12);
  g.fillStyle = L.radial(g, -8, y0 + 8, 1.5, hw * 1.55, [[0, '#86adff'], [0.3, '#3460d2'], [0.72, B0], [1, '#0a174a']]);
  ell(g, 0, y0, hw, ry); g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#a3721a'; ell(g, 0, y0, hw - 5, ry - 4.4); g.stroke();
  g.strokeStyle = `rgba(255,226,134,${q.gw})`; ell(g, 0, y0, hw - 5, ry - 4.4, 0.3 * Math.PI, 1.1 * Math.PI); g.stroke();
  g.fillStyle = 'rgba(4,10,40,0.55)'; ell(g, q.px + 2.2, y0 + q.py - 2, 8.6, 7.2); g.fill();
  g.fillStyle = L.radial(g, q.px - 2.4, y0 + q.py + 2.2, 0.4, 9.6, [[0, '#fffadd'], [0.32, '#ffd862'], [0.8, '#c88d1c'], [1, '#8f5f0c']]);
  ell(g, q.px, y0 + q.py, 8.4, 7); g.fill();
  g.strokeStyle = 'rgba(255,242,196,0.8)'; g.lineWidth = 1.7;
  ell(g, 0, y0, hw - 0.8, ry - 0.8, 0.2 * Math.PI, 0.9 * Math.PI); g.stroke();
}

// ───────────────────────── tile fringe ─────────────────────────
function drawTiles(g, a) {
  const r = L.rng('s37tile');
  // the roof's underside lip, so no light leaks between the tiles
  g.fillStyle = '#060d2c'; a.pathBand(g, -5, -30); g.fill();
  g.strokeStyle = 'rgba(96,134,232,0.4)'; g.lineWidth = 1.6; a.stroke(g, -5.6);
  // drip tiles (滴水): pointed tongues hanging between the tile ends
  for (const { th } of angles(a, TILE, 0, 0.5)) {
    const len = r.range(53, 63), tone = r.range(-0.2, 0.1), lean = r.range(-0.04, 0.04), glint = r.range(0.35, 1);
    a.at(g, th + r.range(-1.8, 1.8) / a.R, 0, () => {
      g.rotate(lean);
      const w = 40;
      const body = () => { g.beginPath(); g.moveTo(-w, 5); g.quadraticCurveTo(0, 17, w, 5); g.bezierCurveTo(w, 30, 16, 39, 0, len); g.bezierCurveTo(-16, 39, -w, 30, -w, 5); g.closePath(); };
      g.fillStyle = 'rgba(8,1,6,0.7)'; g.save(); g.translate(6, -3); body(); g.fill(); g.restore();   // its shadow on the red board
      g.fillStyle = L.linear(g, 0, 5, 0, len, [[0, '#071240'], [0.42, L.shade('#1c3a90', tone)], [0.74, L.shade('#2447a6', tone)], [1, '#0a1648']]);
      body(); g.fill();
      // the glaze rounds over the moulded face: a cool sheen up the middle, the lamp along the lower-left edge
      g.fillStyle = L.radial(g, -3, 36, 0, 15, [[0, 'rgba(126,164,255,0.5)'], [1, 'rgba(126,164,255,0)']]);
      body(); g.fill();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = `rgba(255,214,124,${glint.toFixed(3)})`; g.lineWidth = 2.8;
      g.beginPath(); g.moveTo(-15.5, 38.5); g.quadraticCurveTo(-7, 44, -0.8, len - 1.5); g.stroke();
      g.fillStyle = `rgba(255,244,196,${(glint * 0.95).toFixed(3)})`; ell(g, -3.4, 41, 3.6, 2.2); g.fill();
    });
  }
  // tile ends (瓦当): glazed discs whose tops sit on the arc
  for (const { th } of angles(a, TILE, 0, 0)) {
    const tone = r.range(-0.26, 0.14), lean = r.range(-0.09, 0.09), dy = r.range(0, 2.8), rx = 26 + r.range(-1.8, 1.8), ry = 20 + r.range(-1.4, 1.4);
    const glint = r.range(0.35, 1), hot = r.range(0.35, 1), g0 = r.range(0.56, 0.72), gs = r.range(0.14, 0.3);
    const bx = r.range(-2, 2), by = r.range(-1.4, 1.4), warm = r.range(0, 1);
    a.at(g, th + r.range(-1.8, 1.8) / a.R, 0, () => {
      g.translate(0, dy); g.rotate(lean);
      const cy = ry;
      g.fillStyle = 'rgba(2,4,20,0.9)'; ell(g, 3, cy + 3, rx + 2.4, ry + 2); g.fill();
      g.fillStyle = L.radial(g, -9, cy + 8, 1, rx * 1.55, [[0, L.shade('#8fb2ff', tone)], [0.16, L.shade('#3f6cda', tone)], [0.5, L.shade('#1f3f96', tone)], [1, '#06103a']]);
      ell(g, 0, cy, rx, ry); g.fill();
      // moulded face under the glaze: a raised border round a low boss (the coiled dragon is far too fine to survive 0.2 s)
      g.strokeStyle = 'rgba(4,10,50,0.55)'; g.lineWidth = 2.6; ell(g, 1, cy - 1, rx - 6.4, ry - 5.4); g.stroke();
      g.strokeStyle = 'rgba(128,166,255,0.45)'; g.lineWidth = 1.8; ell(g, 0, cy, rx - 6.4, ry - 5.4, 0.25 * Math.PI, 1.2 * Math.PI); g.stroke();
      g.fillStyle = 'rgba(4,10,52,0.4)'; ell(g, bx + 1.6, cy + by - 1.6, 10.5, 8); g.fill();
      g.fillStyle = L.radial(g, bx - 3.4, cy + by + 3, 0.4, 11, [[0, `rgba(142,178,255,${(0.34 + glint * 0.26).toFixed(3)})`], [0.5, 'rgba(58,100,214,0.5)'], [1, 'rgba(31,63,150,0)']]);
      ell(g, bx, cy + by, 10.5, 8); g.fill();
      // the lit woodwork below throws a little red back up into the glaze
      g.save(); ell(g, 0, cy, rx, ry); g.clip();
      g.fillStyle = L.linear(g, 0, cy + ry * 0.35, 0, cy + ry, [[0, 'rgba(255,96,56,0)'], [1, `rgba(255,96,56,${(0.12 + warm * 0.2).toFixed(3)})`]]);
      g.fillRect(-rx, cy, rx * 2, ry);
      g.restore();
      // the lamp on the glaze: one short streak on the lower-left rim and one hot point
      g.lineCap = 'round';
      g.strokeStyle = `rgba(255,214,124,${glint.toFixed(3)})`; g.lineWidth = 3;
      ell(g, 0, cy, rx - 1.7, ry - 1.7, g0 * Math.PI, (g0 + gs) * Math.PI); g.stroke();
      g.save(); g.translate(-10.5, cy + 7.4); g.rotate(-0.5);
      g.fillStyle = L.radial(g, 0, 0, 0.4, 7.6, [[0, `rgba(255,252,236,${hot})`], [0.42, `rgba(255,226,150,${hot * 0.8})`], [1, 'rgba(255,200,90,0)']]);
      g.scale(1, 0.66); g.beginPath(); g.arc(0, 0, 7.6, 0, L.TAU); g.fill();
      g.restore();
      // cool sky light on the very top edge
      g.strokeStyle = 'rgba(176,206,255,0.78)'; g.lineWidth = 1.9;
      ell(g, 0, cy, rx - 0.9, ry - 0.9, 1.14 * Math.PI, 1.86 * Math.PI); g.stroke();
    });
  }
}

// ───────────────────────── brackets ─────────────────────────
/** one bracket set (一攒斗拱) seen from below: three tiers of arms stepping in toward the wall, then the big block */
function dougong(g, alt) {
  const BL = '#2850ba', GR = '#1f9a72', GD = '#f4c858';
  const armC = alt ? BL : GR, blkC = alt ? GR : BL;
  const sh = 'rgba(6,1,4,0.6)';
  const armPath = (y, hwid, th) => {
    g.beginPath(); g.moveTo(-hwid, y); g.lineTo(hwid, y); g.lineTo(hwid, y + th * 0.4);
    g.quadraticCurveTo(hwid - 3, y + th, hwid - 15, y + th); g.lineTo(-hwid + 15, y + th);
    g.quadraticCurveTo(-hwid + 3, y + th, -hwid, y + th * 0.4); g.closePath();
  };
  const arm = (y, hwid, th) => {
    g.save(); g.translate(5, -5); g.fillStyle = sh; armPath(y, hwid, th); g.fill(); g.restore();
    g.fillStyle = L.linear(g, 0, y, 0, y + th, [[0, L.shade(armC, -0.35)], [0.5, armC], [1, L.shade(armC, 0.3)]]);
    armPath(y, hwid, th); g.fill();
    g.strokeStyle = GD; g.lineWidth = 2.2; g.stroke();
  };
  const block = (x, y, w, h) => {
    g.fillStyle = L.linear(g, 0, y, 0, y + h, [[0, L.shade(blkC, -0.3)], [0.5, blkC], [1, L.shade(blkC, 0.34)]]);
    poly(g, [[x - w / 2, y], [x + w / 2, y], [x + w / 2 - 3, y + h], [x - w / 2 + 3, y + h]]); g.fill();
    g.strokeStyle = GD; g.lineWidth = 1.9; g.stroke();
  };
  g.fillStyle = L.linear(g, -10, 0, 10, 0, [[0, L.shade(armC, 0.34)], [0.4, armC], [1, L.shade(armC, -0.55)]]);
  g.fillRect(-10, 4, 20, 124);
  g.strokeStyle = GD; g.lineWidth = 1.9; g.strokeRect(-10, 4, 20, 124);
  for (const [y, hwid, th] of [[12, 52, 22], [52, 41, 22]]) {
    arm(y, hwid, th);
    for (const bx of [-hwid + 9, 0, hwid - 9]) block(bx, y - 9, 19, 12);
  }
}

// ───────────────────────── the eave ─────────────────────────
function buildEave(env) {
  const a = env.arc;
  const FULL = [-PAD, -PAD, W + PAD * 2, H + PAD * 2];
  const paint = (layer, fn) => { const g = layer.getContext('2d'); g.save(); fn(g); g.restore(); };

  // ── stage 1: boards and the two tiers of rafters ──
  const layer = L.makeLayer(PAD, (g) => {
    const rj = L.rng('s37tone'), rc = L.rng('s37crack');
    // hand-cut timber: every rafter sits a hair off its mark, leans a hair, and takes the paint a little differently
    const one = (th) => ({
      th: th + rj.range(-2.2, 2.2) / a.R, tilt: rj.range(-0.014, 0.014), s: -Y.head * Math.tan(th) * 1.05,
      tone: rj.range(-0.1, 0.07) - (rj.chance(0.08) ? 0.1 : 0), hue: rj.range(-1, 1), dw: rj.range(-2.4, 2.2), grn: rj.range(-1, 1),
      shx: rj.range(-6, 6), shy: rj.range(0, 1), sha: rj.range(0.08, 0.5), gw: rj.range(0.35, 1), px: rj.range(-1.6, 1.6), py: rj.range(-1.2, 1.2) });
    const raf = angles(a, PITCH, 0, 0).map((q) => {
      const f = one(q.th), e = one(q.th);
      f.shy = Y.fly0 + 46 + f.shy * 60; e.shy = 0;
      return { f, e };
    });

    // the boards (望板) between the rafters: dull red; where no rafter shades them they take the lamp like the rafters do
    g.save(); a.clipBelow(g, -9);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 620, a.R, [[0, '#1a0403'], [0.45, '#440c0a'], [0.8, '#66140c'], [1, '#7a190e']]);
    g.fillRect(...FULL);
    g.strokeStyle = 'rgba(14,2,2,0.5)'; g.lineWidth = 2.4;
    for (const d of [158, 212, 338, 396]) a.stroke(g, -d);
    g.restore();

    // 小连檐 / 闸挡板: little boards closing the gaps between the flying rafters, facing out toward the lamp
    g.save(); a.clipBand(g, -Y.xiao0, -Y.xiao1);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - Y.xiao1, a.R - Y.xiao0, [[0, '#7a160b'], [0.5, '#c23119'], [0.86, '#e04a28'], [1, '#ff8a58']]);
    g.fillRect(...FULL);
    g.restore();

    // flying rafters
    for (const q of raf) a.at(g, q.f.th, 0, () => { g.rotate(q.f.tilt); flyRafter(g, q.f, rc); });


    // eave rafters
    for (const q of raf) a.at(g, q.e.th, 0, () => { g.rotate(q.e.tilt); eaveRafter(g, q.e, rc); });
  });
  // oil paint over timber: brush drag and a faint relief running along every rafter
  overlay(layer, 'soft-light', 0.4, (g) => g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's37drag', scale: 30, sx: 0.5, sy: 12, octaves: 4, contrast: 1.7, res: 0.5 }), -PAD, -PAD));
  const hmap = L.polarNoiseLayer(env, PAD, { seed: 's37bump', scale: 11, sx: 0.6, sy: 13, octaves: 3, contrast: 1.5, res: 0.6 });
  overlay(layer, 'overlay', 0.22, (g) => g.drawImage(L.bumpLight(hmap, { angle: 315, strength: 3, res: 0.6 }), -PAD, -PAD));
  // paint that has faded in patches
  overlay(layer, 'soft-light', 0.34, (g) => g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's37fade', scale: 84, octaves: 3, warp: 0.5, contrast: 1.7, res: 0.25 }), -PAD, -PAD));

  // ── the two boards that run along the eave: 大连檐 under the tiles, 小连檐 where the rafter tiers meet ──
  paint(layer, (g) => {
    const along = L.polarNoiseLayer(env, PAD, { seed: 's37along', scale: 18, sx: 9, sy: 0.5, octaves: 4, contrast: 1.8, res: 0.5 });
    const band = (y0, y1, stops) => {
      g.save(); a.clipBand(g, -y0, -y1);
      g.fillStyle = L.radial(g, a.cx, a.cy, a.R - y1, a.R - y0, stops); g.fillRect(...FULL);
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.5; g.drawImage(along, -PAD, -PAD);
      g.restore();
    };
    band(Y.lian0, Y.lian1, [[0, '#f25130'], [0.3, '#c23019'], [1, '#430b06']]);
    g.strokeStyle = 'rgba(255,190,140,0.85)'; g.lineWidth = 1.8; a.stroke(g, -Y.lian1 + 1);
  });

  // ── stage 2: the bracket ring and the purlin in front of it (deep inside; the lens will lose them) ──
  paint(layer, (g) => {
    g.save(); a.clipBelow(g, -Y.dg0 + 2);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - Y.dg0 - 260, a.R - Y.dg0, [[0, '#120303'], [1, '#38090a']]);
    g.fillRect(...FULL);
    g.restore();
    for (const { th, i } of angles(a, 232, -Y.dg0, 0.5)) a.at(g, th, -Y.dg0, () => { g.scale(1.85, 1.85); dougong(g, ((i % 2) + 2) % 2 === 0); });

    // eave purlin (挑檐桁): a round beam banded blue / green with gold hoops
    const seg = 252, dth = seg / (a.R - Y.pur0);
    for (const { th, i } of angles(a, seg, -Y.pur0, 0)) {
      const even = ((i % 2) + 2) % 2 === 0;
      g.fillStyle = even ? '#2449ac' : '#1f9a72';
      a.pathBand(g, -Y.pur0, -Y.pur1, th - dth / 2, th + dth / 2); g.fill();
      // 枋心: a gold-edged panel of the other colour
      const m = 44 / (a.R - Y.pur0);
      g.fillStyle = even ? '#1f8f6a' : '#2a50b8';
      a.pathBand(g, -Y.pur0 - 13, -Y.pur1 + 13, th - dth / 2 + m, th + dth / 2 - m); g.fill();
      g.strokeStyle = C.gold; g.lineWidth = 3; g.stroke();
      // 箍头: gold hoop at each joint
      const h = 12 / (a.R - Y.pur0);
      g.fillStyle = C.gold; a.pathBand(g, -Y.pur0, -Y.pur1, th - dth / 2 - h / 2, th - dth / 2 + h / 2); g.fill();
    }
    // roundness of the purlin + the shadow it throws on the brackets
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - Y.pur1, a.R - Y.pur0, [
      [0, 'rgba(0,0,10,0.8)'], [0.28, 'rgba(0,0,10,0.15)'], [0.5, 'rgba(255,255,255,0.36)'], [0.66, 'rgba(255,255,255,0.02)'], [1, 'rgba(0,0,10,0.78)']]);
    a.pathBand(g, -Y.pur0, -Y.pur1); g.fill();
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - Y.pur1 - 40, a.R - Y.pur1, [[0, 'rgba(6,1,2,0)'], [1, 'rgba(6,1,2,0.8)']]);
    a.pathBand(g, -Y.pur1, -Y.pur1 - 40); g.fill();
  });
  // soot and age over all the woodwork (kept in the red family so it deepens the colour instead of greying it)
  overlay(layer, 'multiply', 0.36, (g) => g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's37soot', scale: 240, octaves: 4, warp: 0.6, res: 0.25, contrast: 1.3, ramp: [[0, '#5a241c'], [0.55, '#ffffff'], [1, '#ffffff']] }), -PAD, -PAD));

  // ── stage 3: the glazed tile fringe on the arc ──
  paint(layer, (g) => drawTiles(g, a));
  overlay(layer, 'overlay', 0.45, (g) => g.drawImage(L.grainTex(W + PAD * 2, H + PAD * 2, { seed: 's37grain', amount: 0.22 }), -PAD, -PAD));

  // ── light: a warm floodlight from below-left, falling off into the depth of the eave and toward the far side ──
  const lx = a.cx - 250, ly = a.crestY + 190;
  overlay(layer, 'source-over', 1, (g) => {
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - 640, a.R - 300, [[0, 'rgba(8,1,4,0.88)'], [0.45, 'rgba(8,1,4,0.55)'], [0.8, 'rgba(8,1,4,0.14)'], [1, 'rgba(8,1,4,0)']]);
    g.fillRect(...FULL);
    g.fillStyle = L.radial(g, lx, ly, 300, 1500, [[0, 'rgba(10,1,7,0)'], [0.45, 'rgba(10,1,7,0.36)'], [1, 'rgba(10,1,7,0.86)']]);
    g.fillRect(...FULL);
  });
  overlay(layer, 'overlay', 1, (g) => {
    g.fillStyle = L.radial(g, lx, ly, 0, 1050, [[0, 'rgba(255,196,140,0.5)'], [0.5, 'rgba(255,170,110,0.2)'], [1, 'rgba(255,160,100,0)']]);
    g.fillRect(...FULL);
  });
  return layer;
}

export default {
  name: '祈年殿檐下',
  tone: 'light',
  init(env) {
    const a = env.arc;
    const FULL = [-PAD, -PAD, W + PAD * 2, H + PAD * 2];
    const eave = buildEave(env);
    // night sky: one flat field, lifted a breath toward blue just above the eave
    const img = L.makeLayer(PAD, (g) => {
      g.fillStyle = C.night; g.fillRect(...FULL);
      g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 700, [[0, 'rgba(12,20,52,0.16)'], [0.3, 'rgba(10,16,40,0.06)'], [1, 'rgba(6,9,20,0)']]);
      g.fillRect(...FULL);
      g.drawImage(eave, -PAD, -PAD);
    });
    const ig = img.getContext('2d');
    // shallow focus: the plane of focus sits on the eave edge at the crest; the frame's sides and the depth of the eave go soft
    const soft = [[L.blurred(img, 2.2), 300, 700, 236, 340], [L.blurred(img, 6.5), 640, 1040, 350, 440], [L.blurred(img, 12), 0, 0, 430, 500]];
    for (const [b, x0, x1, d0, d1] of soft) {
      const masks = [(g) => L.radial(g, a.cx, a.cy, a.R - d1, a.R - d0, [[0, '#000'], [1, 'rgba(0,0,0,0)']])];
      if (x1) masks.push((g) => L.linear(g, a.cx - x1, 0, a.cx + x1, 0, [[0, '#000'], [(x1 - x0) / (2 * x1), 'rgba(0,0,0,0)'], [(x1 + x0) / (2 * x1), 'rgba(0,0,0,0)'], [1, '#000']]));
      for (const mk of masks) {
        const c = L.makeLayer(PAD, (g) => {
          g.drawImage(b, -PAD, -PAD);
          g.globalCompositeOperation = 'destination-in';
          g.fillStyle = mk(g); g.fillRect(...FULL);
        });
        ig.drawImage(c, -PAD, -PAD);
      }
    }
    // bloom from the brightest paint, gold and glaze only (the picture multiplied by itself, then blurred)
    const hi = L.makeLayer(PAD, (g) => { g.drawImage(img, -PAD, -PAD); g.globalCompositeOperation = 'multiply'; g.drawImage(img, -PAD, -PAD); });
    // print it harder: the picture over itself deepens the gaps and saturates the paint
    ig.save(); ig.globalCompositeOperation = 'overlay'; ig.globalAlpha = 0.5; ig.drawImage(img, -PAD, -PAD); ig.restore();
    ig.save(); ig.globalCompositeOperation = 'screen'; ig.globalAlpha = 0.4;
    ig.drawImage(L.blurred(hi, 14), -PAD, -PAD);
    ig.restore();
    S = { img };
  },
  draw(ctx, env, p) {
    const a = env.arc;
    const rot = L.lerp(-0.004, 0.004, p), zoom = L.lerp(1.0, 1.012, p);
    L.blit(ctx, env, S.img, { rot, zoom });
    // a sheen sliding along the rafters and the glazed fringe (kept under the eave line)
    ctx.save(); a.clipBelow(ctx, 2);
    const gl = a.pt(L.lerp(-0.2, -0.06, p), -100);
    L.glow(ctx, gl.x, gl.y, 460, '#ffd9a0', 0.14);
    ctx.restore();
    L.vignette(ctx, { strength: 0.28 });
  },
};
