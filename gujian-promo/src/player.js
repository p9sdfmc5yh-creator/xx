// player.js — loads scenes, composites tagline text + film grain, exposes window.GJ for the renderer.
import * as L from './lib/core.js';
import { FONT_FILES } from './fonts.js';
import { drawBrand, BRAND_DY } from './lib/titlecard.js';

// which film to play: player.html?film=arch (default) | coins | antiques | …
const FILM = new URLSearchParams(location.search).get('film') || 'arch';
const BASE = FILM === 'arch' ? '.' : `./films/${FILM}`;
const TL = await import(`${BASE}/timeline.js`);
const { SHOTS, BEATS, TOTAL_FRAMES, shotAt, FPS } = TL;
// per-film typography for the tagline overlay (a film's timeline.js may export STYLE to override)
const STYLE = TL.STYLE || {};
for (const [k, v] of Object.entries({ font: 'serif', light: '#f7f2e8', dark: '#15110d', blur: 0.6 })) if (STYLE[k] === undefined) STYLE[k] = v;
if (!STYLE.title) STYLE.title = {};
const TITLE = TL.TITLE || {};   // { title, seal, cta, brand? } — `brand` is drawn on the opening shot and on the closing card
/** change typography at runtime (used by the specimen tool): { font, blur, light, dark, title: {...}, beats: { 1: {...}, 2: {...}, 3: {...} } } */
function setStyle(patch = {}) {
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'title') Object.assign(STYLE.title, v);
    else if (k === 'beats') for (const [b, bv] of Object.entries(v)) Object.assign(BEATS[b], bv);
    else STYLE[k] = v;
  }
}

const { W, H } = L;
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const errors = [];
const missingFonts = [];
const loaded = new Map(); // shot.id → { mod, env, initMs }

async function loadFonts() {
  await Promise.all(FONT_FILES.map(async ({ family, file, desc, required }) => {
    try { const f = new FontFace(family, `url(../assets/fonts/${file})`, desc || {}); await f.load(); document.fonts.add(f); }
    catch (e) { if (required) errors.push(`font ${family}: ${e.message}`); else missingFonts.push(family); }
  }));
}

function makeEnv(shot) {
  const arc = L.makeArc({ cx: W / 2, crestY: shot.arc.crestY, R: shot.arc.R });
  return { W, H, FPS, id: shot.id, arc, frames: shot.frames, dur: shot.frames / FPS, seed: shot.id, t: 0, frame: 0, p: 0, state: {} };
}

async function ensure(shot) {
  if (loaded.has(shot.id)) return loaded.get(shot.id);
  const t0 = performance.now();
  let mod;
  try { mod = (await import(`${BASE}/scenes/${shot.scene}.js`)).default; }
  catch (e) { errors.push(`${shot.id} import: ${e.message}`); mod = null; }
  const env = makeEnv(shot);
  if (mod && mod.init) {
    try { await mod.init(env); } catch (e) { errors.push(`${shot.id} init: ${e.stack || e.message}`); }
  }
  const rec = { mod, env, initMs: performance.now() - t0 };
  loaded.set(shot.id, rec);
  return rec;
}

// ── global finishing layers ──
// fine, light grain: enough to keep gradients from banding after compression without roughening flat colour
const GRAIN = Object.assign({ size: 1, amount: 0.42, alpha: 0.1 }, STYLE.grain || {});
let grains = null;
let dithers = null;   // ±1-level noise added to every frame so that dark, smooth gradients do not band in 8 bits
function ensureGrain() {
  if (grains) return;
  grains = [1, 2, 3, 4, 5].map((s) => L.grainTex(W + 64, H + 64, { seed: 'film' + s, amount: GRAIN.amount, size: GRAIN.size }));
  dithers = [1, 2, 3].map((s) => {
    const c = L.makeCanvas(W + 64, H + 64), g = c.getContext('2d'), img = g.createImageData(W + 64, H + 64), d = img.data, r = L.rng('dither' + s);
    for (let i = 0; i < d.length; i += 4) { const v = Math.floor(r() * 4); d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }   // adds 0…3 levels
    g.putImageData(img, 0, 0); return c;
  });
}

const beatShots = { 1: SHOTS.filter((s) => s.beat === 1), 2: SHOTS.filter((s) => s.beat === 2), 3: SHOTS.filter((s) => s.beat === 3) };

/** tagline text sits just above the arc crest, hard-cutting with every shot like the reference */
const textCache = new Map(); // shot.id + style signature → canvas (the text never moves within a shot)
function beatTextLayer(shot, rec) {
  const b = BEATS[shot.beat]; if (!b) return null;
  const list = beatShots[shot.beat]; const k = list.indexOf(shot); const u = list.length > 1 ? k / (list.length - 1) : 0;
  const size = b.sizeEnd ? L.lerp(b.size, b.sizeEnd, u) : b.size * (1 + 0.05 * u);
  const tone = (rec.mod && rec.mod.tone) || 'light';
  const sig = JSON.stringify([shot.id, b, STYLE.font, STYLE.light, STYLE.dark, STYLE.blur, STYLE.halo, tone, rec.env.arc.crestY]);
  if (textCache.has(sig)) return textCache.get(sig);
  const r = L.rng('txt' + shot.id);
  const color = tone === 'dark' ? STYLE.dark : STYLE.light;
  const x = W / 2 + r.range(-5, 5);
  const y = rec.env.arc.crestY - b.gap - size * 0.5 + r.range(-4, 4);
  const c = L.makeCanvas(W, H); const g = c.getContext('2d');
  const k2 = size / b.size;
  const opts = { font: b.font || STYLE.font, size, weight: b.weight, color, spacing: b.spacing * k2, kern: b.kern ? b.kern.map((v) => v * k2) : null,
    rotate: r.range(-0.006, 0.006), alpha: 0.97, stroke: b.stroke ? { color, width: b.stroke } : null };
  // 1) a soft, shapeless local dimming (or lift, under dark text) so the words hold on busy textures without a visible halo
  const halo = STYLE.halo === undefined ? 0.24 : STYLE.halo;
  if (halo > 0) {
    g.save(); g.filter = `blur(${Math.round(size * 0.22)}px)`; g.globalAlpha = halo;
    L.text(g, b.text, x, y, { ...opts, color: tone === 'dark' ? '#fffaf0' : '#000000', alpha: 1, stroke: { color: tone === 'dark' ? '#fffaf0' : '#000000', width: size * 0.16 } });
    g.restore();
  }
  // 2) the words, with an optical softness that scales with size (≈0.4 % of the font size)
  g.save();
  const blur = STYLE.blur === 0 ? 0 : Math.max(0.3, size * 0.004 * ((STYLE.blur || 0.6) / 0.6));
  if (blur) g.filter = `blur(${blur.toFixed(2)}px)`;
  L.text(g, b.text, x, y, opts);
  g.restore();
  textCache.set(sig, c);
  return c;
}
function drawBeatText(shot, rec) {
  const layer = beatTextLayer(shot, rec);
  if (layer) ctx.drawImage(layer, 0, 0);
}

function drawGuide(env) {
  const a = env.arc;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,0,255,0.9)'; ctx.lineWidth = 3; a.stroke(ctx, 0);
  ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(0,255,255,0.8)'; ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 330, a.crestY - 260, 660, 250); // text-safe zone
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.restore();
}

function errorSlate(msg) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#300'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f88'; ctx.font = '28px monospace'; ctx.textBaseline = 'top';
  String(msg).split('\n').slice(0, 24).forEach((ln, i) => ctx.fillText(ln.slice(0, 110), 40, 40 + i * 36));
  ctx.restore();
}

/** draw one shot at progress p ∈ [0,1]. opts: { text=true, finish=true, guide=false, frame } */
async function renderShot(id, p, opts = {}) {
  const shot = SHOTS.find((s) => s.id === id);
  if (!shot) throw new Error('unknown shot ' + id);
  const rec = await ensure(shot);
  const { text = true, finish = true, guide = false } = opts;
  const frame = opts.frame !== undefined ? opts.frame : Math.min(shot.frames - 1, Math.round(p * (shot.frames - 1)));
  rec.env.p = p; rec.env.frame = frame; rec.env.t = frame / FPS; rec.env.globalFrame = shot.start + frame;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ensureGrain();
  const t0 = performance.now();
  if (!rec.mod) errorSlate(`scene ${shot.scene} failed to load\n` + errors.join('\n'));
  else {
    ctx.save();
    try { rec.mod.draw(ctx, rec.env, p); }
    catch (e) { errors.push(`${shot.id} draw@${frame}: ${e.stack || e.message}`); ctx.restore(); ctx.save(); errorSlate(`${shot.id} draw error\n${e.stack || e.message}`); }
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  if (text && shot.id === 's01' && TITLE.brand) drawBrand(ctx, TITLE.brand, rec.env.arc.crestY + BRAND_DY, STYLE.title && STYLE.title.brand);
  if (text && shot.beat) drawBeatText(shot, rec);
  if (finish) {
    ensureGrain();
    const gf = shot.start + frame; const g = grains[gf % grains.length];
    const r = L.rng('gr' + gf);
    L.overlayGrain(ctx, g, GRAIN.alpha, 'overlay', Math.floor(r() * 64), Math.floor(r() * 64));
    L.overlayGrain(ctx, dithers[gf % dithers.length], 1, 'lighter', Math.floor(r() * 64), Math.floor(r() * 64));
    L.vignette(ctx, { strength: 0.16, inner: 0.55, outer: 1.1 });
  }
  ctx.getImageData(0, 0, 1, 1); // canvas drawing is deferred: read one pixel back so the timing includes rasterisation
  const drawMs = performance.now() - t0;
  if (guide) drawGuide(rec.env);
  return { drawMs, initMs: rec.initMs };
}

async function renderFrame(n, opts = {}) {
  const shot = shotAt(n);
  const frame = n - shot.start;
  const p = shot.frames > 1 ? frame / (shot.frames - 1) : 0;
  return renderShot(shot.id, p, { ...opts, frame });
}

const ready = loadFonts();
window.GJ = {
  ready, errors, missingFonts, SHOTS, TOTAL_FRAMES, FPS, film: FILM,
  renderShot, renderFrame, setStyle,
  setGrain: (g) => { Object.assign(GRAIN, g); grains = null; },
  preload: async (ids) => { for (const s of SHOTS) if (!ids || ids.includes(s.id)) await ensure(s); return errors.slice(); },
  toDataURL: (type = 'image/png', q) => canvas.toDataURL(type, q),
};
