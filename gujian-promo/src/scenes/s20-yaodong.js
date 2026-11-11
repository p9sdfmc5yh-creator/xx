// s20 — 窑洞灯火. Dusk at a Shaanbei cave dwelling (窑洞), seen close under the crown of its arched window and completely
// out of focus, as if through a layer of hot air. The arc is the lip of the arched opening: above it the loess wall still
// glows orange in the last light and deepens to red overhead; below it the reveal falls into shadow, and inside that the
// papered lattice shows as one row of hazy, lamp-lit panes — gold next to the lamp, ember-red far from it — with a single
// red paper-cut (窗花) in the middle pane.
// The whole picture is painted as ONE greyscale light field, blurred, and only then mapped through a fire ramp
// (maroon → crimson → orange → gold): wherever light falls away — at the arc, round every pane — it passes through
// saturated red on its way to the dark, the way halation does on film.
import * as L from '../lib/core.js';

const { W, H } = L;
const PAD = 120;                      // the move is a ±1 % push-in, so a modest margin is plenty
const FW = W + PAD * 2, FH = H + PAD * 2;

// the window, measured inward from the arc (px)
const REV = 92;                       // soffit of the reveal: the shadowed underside of the arch between the wall face and the frame
const HEAD = 24;                      // bowed head of the timber frame
const TOP = REV + HEAD;               // …so the paper starts this far inside the arc
const BAND = 270;                     // height of the row of panes
const RAIL = 40;                      // the rail that closes the row
const PITCH = 116, RIB = 22;          // upright bars: spacing along the arc / width
const HALO = 150;                     // how far the glow of the lit wall bleeds down into the shadow of the opening

// light → colour. 0.565 is the wall beside the arc; the paper-cut sits around 0.38; bare lamp-lit paper runs 0.6–1.
const FIRE = [
  [0, '#12060a'], [0.06, '#230910'], [0.12, '#3a0b15'], [0.2, '#5c0d1a'], [0.28, '#86111d'], [0.35, '#b1171b'],
  [0.41, '#c8241a'], [0.47, '#cb401b'], [0.52, '#cd551c'], [0.565, '#cf671d'], [0.62, '#db7a20'], [0.7, '#ea8b26'],
  [0.78, '#f6a034'], [0.86, '#ffb84a'], [0.93, '#ffd27c'], [1, '#fff0c4'],
];
let S = null;

const gy = (v, al = 1) => { const n = Math.round(L.clamp(v) * 255); return `rgba(${n},${n},${n},${al})`; };

/** cheap wide blur: downsample ×k, blur, upsample back to a full padded layer */
function soft(src, px, k = 4) {
  const w = Math.ceil(src.width / k), h = Math.ceil(src.height / k);
  const s = L.makeCanvas(w, h), sg = s.getContext('2d');
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
  sg.filter = `blur(${(px / k).toFixed(2)}px)`;
  sg.drawImage(src, 0, 0, w, h);
  const o = L.makeCanvas(src.width, src.height), og = o.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(s, 0, 0, src.width, src.height);
  o._pad = src._pad;
  return o;
}
/** anisotropic blur: squash by kx × ky, blur, stretch back → light smeared mostly up and down */
function smear(src, kx, ky, px) {
  const w = Math.ceil(src.width / kx), h = Math.ceil(src.height / ky);
  const s = L.makeCanvas(w, h), sg = s.getContext('2d');
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
  sg.filter = `blur(${px}px)`;
  sg.drawImage(src, 0, 0, w, h);
  const o = L.makeCanvas(src.width, src.height), og = o.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(s, 0, 0, src.width, src.height);
  o._pad = src._pad;
  return o;
}
/** hot air between us and the window: every row of the picture slips sideways a few px, slowly along the height */
function shimmer(src, amp) {
  const out = L.makeCanvas(src.width, src.height), og = out.getContext('2d');
  const nz = L.makeNoise('s20heat');
  const step = 3;
  for (let y = 0; y < src.height; y += step) {
    const dx = amp * (nz.n2(y / 130, 0.3) + 0.45 * nz.n2(y / 41, 5.1));
    og.drawImage(src, 0, y, src.width, step, dx, y, src.width, step);
  }
  out._pad = src._pad;
  return out;
}
/** grey light field → colour, through a ramp; a little ordered noise between neighbouring levels keeps the long gradients from banding */
function colourise(src, stops) {
  const w = src.width, h = src.height;
  const img = src.getContext('2d').getImageData(0, 0, w, h), d = img.data;
  const ramp = L.makeRamp(stops), N = 1024, lut = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) { const c = ramp(i / (N - 1)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  let s = 0x9e3779b9;
  for (let i = 0; i < d.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const k = (d[i] * 4 + (s >>> 30)) * 3;
    d[i] = lut[k]; d[i + 1] = lut[k + 1]; d[i + 2] = lut[k + 2]; d[i + 3] = 255;
  }
  const out = L.makeCanvas(w, h);
  out.getContext('2d').putImageData(img, 0, 0);
  out._pad = src._pad;
  return out;
}

// ───────────────────────── geometry ─────────────────────────
function geom(a) {
  const d = PITCH / (a.R - TOP), s = a.span(PAD + 200);
  const r = L.rng('s20ribs');
  // upright bars, hand-set: none of them quite the same width, none quite plumb. The middle pane is three bays wide.
  const ribs = [];
  for (let i = 1; (i + 0.5) * d < s; i++) for (const sg of [-1, 1]) {
    ribs.push({ th: sg * (i + 0.5) * d + (i > 1 ? r.range(-0.0042, 0.0042) : 0), w: RIB * (r.chance(0.16) ? r.range(1.4, 1.7) : r.range(0.7, 1.2)), lean: r.range(-0.016, 0.016) });
  }
  ribs.sort((p, q) => p.th - q.th);
  // every pane is its own sheet of paper: thinner or thicker, newer or smoke-browned
  const panes = [];
  for (let i = 0; i < ribs.length - 1; i++) {
    const mid = ribs[i].th < 0 && ribs[i + 1].th > 0;
    let f = mid ? 1 : r.range(0.62, 1);
    if (!mid && r.chance(0.24)) f *= 0.5;
    panes.push({ t0: ribs[i].th, t1: ribs[i + 1].th, f, mid });
  }
  const m = panes.findIndex((q) => q.mid);
  panes[m - 1].f = 0.92; panes[m + 1].f = 0.78; panes[m + 2].f = Math.min(panes[m + 2].f, 0.5);
  const cut = { x: a.cx + 6, y: a.crestY + TOP + BAND / 2 + 2, r: 136 };
  const lamp = { x: a.cx - 132, y: a.crestY + TOP + BAND * 0.56 };   // the oil lamp, behind the left of the middle pane
  return { ribs, panes, cut, lamp };
}

// ───────────────────────── the paper-cut (窗花) ─────────────────────────
// A folded-and-cut eight-petal rosette (八瓣团花): a silhouette with the classic cut marks punched out of it —
// teardrops, crescents, slits. No characters. Returned as a white-on-transparent mask.
function rosette(R) {
  const size = Math.ceil(R * 2 + 8);
  const c = L.makeCanvas(size, size), g = c.getContext('2d');
  g.translate(size / 2, size / 2); g.scale(R, R);
  const ring = (n, phase, fn) => { for (let i = 0; i < n; i++) { g.save(); g.rotate(phase + (i * L.TAU) / n); fn(i); g.fill(); g.restore(); } };
  const petal = (r0, r1, w) => () => {   // leaf pointed at both ends, pointing outward
    g.beginPath(); g.moveTo(0, -r0);
    g.bezierCurveTo(w * 1.3, -L.lerp(r0, r1, 0.32), w * 0.8, -L.lerp(r0, r1, 0.8), 0, -r1);
    g.bezierCurveTo(-w * 0.8, -L.lerp(r0, r1, 0.8), -w * 1.3, -L.lerp(r0, r1, 0.32), 0, -r0); g.closePath();
  };
  const drop = (r0, r1, w) => () => {    // teardrop: point toward the centre, round end outward
    g.beginPath(); g.moveTo(0, -r0);
    g.bezierCurveTo(w * 0.5, -L.lerp(r0, r1, 0.5), w * 1.35, -r1, 0, -r1);
    g.bezierCurveTo(-w * 1.35, -r1, -w * 0.5, -L.lerp(r0, r1, 0.5), 0, -r0); g.closePath();
  };
  const crescent = (rc, half, sag, thick) => () => {
    g.beginPath(); g.moveTo(-half, -rc); g.quadraticCurveTo(0, -rc - sag, half, -rc); g.quadraticCurveTo(0, -rc - sag + thick, -half, -rc); g.closePath();
  };
  const dot = (rc, rad) => () => { g.beginPath(); g.arc(0, -rc, rad, 0, L.TAU); };
  const disc = (rad) => { g.beginPath(); g.arc(0, 0, rad, 0, L.TAU); g.fill(); };
  const E = Math.PI / 8;
  g.fillStyle = '#fff';
  ring(8, 0, dot(0.76, 0.27));                 // eight round petals…
  ring(8, E, petal(0.6, 1.02, 0.15));          // …with a pointed sepal between each pair
  disc(0.74);
  g.globalCompositeOperation = 'destination-out';
  ring(8, 0, crescent(0.87, 0.15, 0.1, 0.07)); // 月牙纹 in every petal
  ring(8, 0, drop(0.31, 0.68, 0.11));          // an inner flower of eight teardrops round a solid heart
  ring(8, E, dot(0.61, 0.04));
  disc(0.07);
  return c;
}

// ───────────────────────── the light field (greyscale) ─────────────────────────
function buildField(env, G) {
  const a = env.arc, lamp = G.lamp;
  const yTop = -TOP, yBot = -TOP - BAND, yLow = yBot - RAIL;
  const r = L.rng('s20paper');

  // 1 — the papered lattice, lit from inside
  const win = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, FW, FH);
    g.save(); a.clipBelow(g, yTop + 3);
    // the lamp stands on the sill, close behind the paper: gold beside it, falling away fast to embers toward the springing of the arch
    const law = [];
    for (let i = 0; i <= 26; i++) { const t = i / 26, d = t * 1400; law.push([t, gy(0.1 + 0.76 * Math.pow(1 + (d / 400) ** 2, -1.25))]); }
    g.fillStyle = L.radial(g, lamp.x, lamp.y, 0, 1400, law);
    g.fillRect(-PAD, -PAD, FW, FH);
    g.globalCompositeOperation = 'multiply';
    for (const pn of G.panes) { g.fillStyle = gy(pn.f); a.pathBand(g, yTop + 4, yBot - RAIL / 2, pn.t0, pn.t1); g.fill(); }
    // the head shades the top of each pane; the light thins toward its foot
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R + yBot, a.R + yTop, [[0, gy(0.62)], [0.4, gy(0.9)], [0.74, gy(1)], [1, gy(0.84)]]);
    a.pathBand(g, yTop + 4, yBot - 2); g.fill();
    // below the rail the window goes on, but only as embers
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R + yLow - 420, a.R + yLow, [[0, gy(0.03)], [0.5, gy(0.09)], [1, gy(0.22)]]);
    a.pathBelow(g, yLow + 2); g.fill();
    // hand-made paper is cloudy by transmitted light
    g.globalAlpha = 0.8;
    g.drawImage(L.noiseTex(FW, FH, { seed: 's20cloud', scale: 170, octaves: 3, warp: 0.8, res: 0.25, contrast: 1.6, ramp: [[0, gy(0.58)], [0.5, gy(0.9)], [1, '#fff']] }), -PAD, -PAD);
    g.globalAlpha = 1;
    // a few panes have been patched with a second layer
    for (let i = 0; i < 7; i++) {
      const pn = G.panes[r.int(0, G.panes.length - 1)]; if (pn.mid) continue;
      const th = L.lerp(pn.t0, pn.t1, r.range(0.3, 0.7));
      a.at(g, th, yTop - r.range(40, BAND - 60), () => { g.rotate(r.range(-0.2, 0.2)); g.fillStyle = gy(r.range(0.66, 0.82)); g.fillRect(-r.range(30, 50), -r.range(30, 60), r.range(60, 96), r.range(60, 120)); });
    }
    g.globalCompositeOperation = 'screen';
    // the flame itself, a soft hot core behind the paper
    g.fillStyle = L.radial(g, lamp.x, lamp.y, 0, 170, [[0, gy(0.7)], [0.3, gy(0.4)], [0.65, gy(0.12)], [1, gy(0)]]);
    g.fillRect(lamp.x - 180, lamp.y - 180, 360, 360);
    g.restore();
    // the lattice: upright bars and the rail under them
    g.fillStyle = gy(0.03);
    for (const rb of G.ribs) a.at(g, rb.th, yTop, () => { g.rotate(rb.lean); g.fillRect(-rb.w / 2, -10, rb.w, 1300); });
    a.pathBand(g, yBot, yLow); g.fill();
  });
  const winW = shimmer(win, 6);

  // 2 — frame head and reveal: the dark throat of the opening, in front of the window
  const inner = L.makeLayer(PAD, (g) => {
    g.drawImage(winW, -PAD, -PAD);
    g.fillStyle = gy(0.03); a.pathBand(g, -REV + 1, yTop); g.fill();
    // soffit of the reveal: in shadow; a little lamp light creeps up it from the frame
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - REV, a.R, [[0, gy(0.09)], [0.45, gy(0.05)], [1, gy(0.05)]]);
    a.pathBand(g, 40, -REV); g.fill();
    g.save(); a.clipBand(g, 40, -REV);
    g.globalCompositeOperation = 'screen';
    g.fillStyle = L.radial(g, lamp.x + 60, a.yAt(lamp.x + 60, -REV), 0, 620, [[0, gy(0.15)], [0.4, gy(0.06)], [1, gy(0)]]);
    g.fillRect(-PAD, -PAD, FW, FH);
    g.restore();
    // the opening sinks into the dark toward the springing and the foot of the frame
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = L.radial(g, a.cx, a.crestY + 160, 600, 1250, [[0, '#fff'], [1, gy(0.5)]]);
    g.fillRect(-PAD, -PAD, FW, FH);
  });

  // 3 — the lens: nothing behind the arch is sharp; least soft under the crest, melting away toward the sides and the foot
  const near = soft(inner, 20, 4), far = soft(inner, 46, 8);
  {
    const fg = far.getContext('2d');
    fg.globalCompositeOperation = 'destination-in';
    fg.fillStyle = L.radial(fg, a.cx + PAD, a.crestY + 150 + PAD, 240, 1050, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,1)']]);
    fg.fillRect(0, 0, far.width, far.height);
  }
  const streak = smear(winW, 4, 20, 2.6);       // the lights run downward, as they do through rising heat
  const halo = soft(winW, 90, 8);               // veil of light round the lamp
  const bloom = soft(winW, 34, 4);              // the brightest panes spill over their bars
  // everything the lens adds stays inside the opening, feathered so that it leaves no seam under the arc
  const veil = L.makeLayer(PAD, (g) => {
    g.globalAlpha = 0.42; g.drawImage(streak, -PAD, -PAD + 40);
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.26; g.drawImage(halo, -PAD, -PAD);
    g.globalAlpha = 0.2; g.drawImage(bloom, -PAD, -PAD);
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in';
    g.drawImage(soft(L.makeLayer(PAD, (m) => { m.fillStyle = '#fff'; a.pathBelow(m, -50); m.fill(); }), 18, 4), -PAD, -PAD);
  });
  // glints: lamp light caught in the thin places of the paper — short upright dashes, the only nearly-sharp things here.
  // They only exist where there is light behind them, so they are multiplied by the blurred window.
  const glint = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, FW, FH);
    const q = L.rng('s20glint'), s = a.span(PAD + 60);
    for (let i = 0; i < 230; i++) {
      const th = q.range(-s, s), dr = yTop - q.range(6, BAND + RAIL + 150);
      const big = q.chance(0.12);
      const w = big ? q.range(12, 20) : q.range(4, 10), h = w * q.range(2.6, 6.5), v = big ? q.range(0.25, 0.5) : q.range(0.35, 1);
      a.at(g, th, dr, () => {
        g.rotate(-th + q.range(-0.03, 0.03)); g.scale(w, h);
        g.fillStyle = L.radial(g, 0, 0, 0, 1, [[0, gy(1, v)], [0.45, gy(1, v * 0.42)], [1, gy(1, 0)]]);
        g.beginPath(); g.arc(0, 0, 1, 0, L.TAU); g.fill();
      });
    }
    g.globalCompositeOperation = 'multiply';
    g.drawImage(near, -PAD, -PAD);
  });
  // the paper-cut holds back most of the light. It goes in after the veil, so the red stays red:
  // multiplied where the paper behind it is dim, capped at one red where the lamp is hot. Out of focus like everything else.
  const mask = rosette(G.cut.r), CM = 48;
  const cutAt = (v) => {
    const t = L.makeCanvas(mask.width, mask.height), tg = t.getContext('2d');
    tg.drawImage(mask, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = gy(v); tg.fillRect(0, 0, t.width, t.height);
    const c = L.makeCanvas(mask.width + CM * 2, mask.height + CM * 2), cg = c.getContext('2d');
    cg.filter = 'blur(8.5px)'; cg.drawImage(t, CM, CM);
    return c;
  };
  const cutMul = cutAt(0.56), cutCap = cutAt(0.385);

  // 4 — halation: the lit wall bleeds into the shadow of the opening, the way a bright field does on film —
  // reddest right under the arc, dying away a hand's width inside it
  const rim = L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, FW, FH);   // opaque: it is screened on, and black adds nothing
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R - HALO, a.R + 2, [[0, gy(0)], [0.22, gy(0.04)], [0.48, gy(0.115)], [0.74, gy(0.215)], [1, gy(0.33)]]);
    a.pathBand(g, 40, -HALO); g.fill();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(L.noiseTex(FW, FH, { seed: 's20rim', scale: 520, octaves: 2, res: 0.2, ramp: [[0, gy(0.8)], [1, '#fff']] }), -PAD, -PAD);
  });
  // 5 — the loess wall in the last light: one even field of orange, a shade fuller a hand's width above the opening.
  // Its edge IS the arc: feathered only a few px, so the line stays the firmest thing in a picture made of haze.
  const wall = soft(L.makeLayer(PAD, (g) => {
    g.save(); a.clipAbove(g, 0);
    g.fillStyle = L.radial(g, a.cx, a.cy, a.R, a.R + 1000, [[0, gy(0.525)], [0.03, gy(0.548)], [0.09, gy(0.565)], [0.3, gy(0.552)], [0.56, gy(0.525)], [1, gy(0.48)]]);
    g.fillRect(-PAD, -PAD, FW, FH);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.4;
    g.drawImage(L.noiseTex(FW, FH, { seed: 's20wall', scale: 460, octaves: 3, warp: 0.5, res: 0.2, ramp: [[0, gy(0.92)], [1, '#fff']] }), -PAD, -PAD);
    g.restore();
  }), 8, 2);

  return L.makeLayer(PAD, (g) => {
    g.fillStyle = '#000'; g.fillRect(-PAD, -PAD, FW, FH);
    g.drawImage(near, -PAD, -PAD); g.drawImage(far, -PAD, -PAD);
    g.globalCompositeOperation = 'screen'; g.drawImage(veil, -PAD, -PAD);
    g.save(); a.clipBelow(g, yTop + 8);
    // faint fibres of light in the paper, running with the bars
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3;
    g.drawImage(L.polarNoiseLayer(env, PAD, { seed: 's20fibre', scale: 24, sx: 1, sy: 30, octaves: 2, res: 0.25, contrast: 1.4, ramp: [[0, gy(0.74)], [0.6, gy(0.97)], [1, '#fff']] }), -PAD, -PAD);
    g.restore();
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.8; g.drawImage(glint, -PAD, -PAD);
    g.save();
    g.globalAlpha = 1; g.translate(G.cut.x, G.cut.y); g.rotate(0.05);
    g.globalCompositeOperation = 'multiply'; g.drawImage(cutMul, -cutMul.width / 2, -cutMul.height / 2);
    g.globalCompositeOperation = 'darken'; g.drawImage(cutCap, -cutCap.width / 2, -cutCap.height / 2);
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'screen'; g.drawImage(rim, -PAD, -PAD);
    g.globalCompositeOperation = 'source-over'; g.drawImage(wall, -PAD, -PAD);
  });
}

const FLW = 1200, FLH = 760;          // sprite that carries the lamp's flicker

export default {
  name: '窑洞灯火',
  tone: 'light',
  init(env) {
    const a = env.arc, G = geom(a);
    const scene = colourise(buildField(env, G), FIRE);
    {
      // grade: the wall deepens to red overhead and in the corners; the foot of the frame sinks
      const g = scene.getContext('2d');
      g.translate(PAD, PAD);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = L.radial(g, a.cx, a.cy, a.R + 200, a.R + 900, [[0, '#ffffff'], [0.5, '#e2a996'], [1, '#a85c4c']]);
      g.fillRect(-PAD, -PAD, FW, FH);
    }
    // flicker: the lit window screened over itself (so the paper-cut keeps its contrast), fading out away from the lamp
    const fx = G.lamp.x - FLW / 2, fy = G.lamp.y - FLH / 2;
    const flick = L.makeCanvas(FLW, FLH), fg = flick.getContext('2d');
    fg.translate(-fx, -fy);
    fg.save(); a.clipBelow(fg, -REV); fg.drawImage(scene, -PAD, -PAD); fg.restore();
    fg.globalCompositeOperation = 'destination-in';
    fg.fillStyle = L.radial(fg, G.lamp.x, G.lamp.y, 60, FLH / 2, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    fg.fillRect(fx, fy, FLW, FLH);
    S = { scene, flick, fx, fy };
  },
  draw(ctx, env, p) {
    const f = env.frame;
    // the push-in is centred on p = 0.5, so the arc is exact mid-shot and within ~3 px at the far edges throughout
    const zoom = L.lerp(0.988, 1.012, p);
    L.blit(ctx, env, S.scene, { zoom });
    // oil-lamp flicker (deterministic): the light round the flame breathes from frame to frame
    const fl = L.clamp(0.55 + 0.34 * Math.sin(f * 0.85 + 0.5) + 0.11 * Math.sin(f * 2.9 + 1.9));
    L.cam(ctx, env, { zoom }, () => {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.06 + 0.16 * fl;
      ctx.drawImage(S.flick, S.fx, S.fy);
    });
  },
};
