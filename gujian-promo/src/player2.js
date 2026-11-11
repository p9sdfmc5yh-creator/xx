// player2.js — the renderer page for the square "collector's plate" films (1080 × 1080). Same window.GJ interface as player.js,
// so tools/render.js works unchanged; tools/preview2.js makes the stills. A film opts in with a file  src/films/<film>/PLAYER  containing "player2.html".
import * as L from './lib/core.js';
import * as K from './lib/plate.js';
import { FONT_FILES } from './fonts.js';

const FILM = new URLSearchParams(location.search).get('film') || 'coins2';
const TL = await import(`./films/${FILM}/timeline.js`);
const { SHOTS, TOTAL_FRAMES, shotAt, FPS } = TL;
const S = K.S;
const canvas = document.getElementById('c');
canvas.width = S; canvas.height = S;
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
  return { W: S, H: S, S, FPS, id: shot.id, scene: shot.scene, frames: shot.frames, dur: shot.frames / FPS, seed: shot.id, glyph: K.GLYPH, t: 0, frame: 0, p: 0, state: {} };
}
async function ensure(shot) {
  if (loaded.has(shot.id)) return loaded.get(shot.id);
  const t0 = performance.now();
  let mod;
  try { mod = (await import(`./films/${FILM}/scenes/${shot.scene}.js`)).default; }
  catch (e) { errors.push(`${shot.id} import: ${e.message}`); mod = null; }
  const env = makeEnv(shot);
  if (mod && mod.init) {
    try { await mod.init(env); } catch (e) { errors.push(`${shot.id} init: ${e.stack || e.message}`); }
  }
  const rec = { mod, env, initMs: performance.now() - t0 };
  loaded.set(shot.id, rec);
  return rec;
}

// finishing: fine grain (keeps gradients from banding after compression) and a very light vignette
let grains = null, dithers = null;
function ensureGrain() {
  if (grains) return;
  grains = [1, 2, 3, 4, 5].map((s) => L.grainTex(S + 64, S + 64, { seed: 'film2' + s, amount: 0.42, size: 1 }));
  dithers = [1, 2, 3].map((s) => {
    const c = L.makeCanvas(S + 64, S + 64), g = c.getContext('2d'), img = g.createImageData(S + 64, S + 64), d = img.data, r = L.rng('dither2' + s);
    for (let i = 0; i < d.length; i += 4) { const v = Math.floor(r() * 4); d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0); return c;
  });
}
function vignette(strength = 0.12) {
  const rad = Math.hypot(S / 2, S / 2);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = L.radial(ctx, S / 2, S / 2, rad * 0.6, rad * 1.08, [[0, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${strength})`]]);
  ctx.fillRect(0, 0, S, S); ctx.restore();
}
function errorSlate(msg) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#300'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#f88'; ctx.font = '22px monospace'; ctx.textBaseline = 'top';
  String(msg).split('\n').slice(0, 30).forEach((ln, i) => ctx.fillText(ln.slice(0, 84), 30, 30 + i * 30));
  ctx.restore();
}

/** draw one shot at progress p ∈ [0,1]. opts: { finish=true, guide=false, frame } */
async function renderShot(id, p, opts = {}) {
  const shot = SHOTS.find((s) => s.id === id);
  if (!shot) throw new Error('unknown shot ' + id);
  const rec = await ensure(shot);
  const { finish = true, guide = false } = opts;
  const frame = opts.frame !== undefined ? opts.frame : Math.min(shot.frames - 1, Math.round(p * (shot.frames - 1)));
  rec.env.p = p; rec.env.frame = frame; rec.env.t = frame / FPS; rec.env.globalFrame = shot.start + frame;
  const reset = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  reset(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ensureGrain();
  const t0 = performance.now();
  if (!rec.mod) errorSlate(`scene ${shot.scene} failed to load\n` + errors.join('\n'));
  else {
    ctx.save();
    if (shot.flip) { ctx.translate(S, 0); ctx.scale(-1, 1); }   // mirrored repeat of an earlier plate (the glyph is symmetric)
    try { rec.mod.draw(ctx, rec.env, p); }
    catch (e) { errors.push(`${shot.id} draw@${frame}: ${e.stack || e.message}`); ctx.restore(); ctx.save(); errorSlate(`${shot.id} draw error\n${e.stack || e.message}`); }
    ctx.restore();
  }
  reset();
  if (finish) {
    const gf = shot.start + frame; const r = L.rng('gr2' + gf);
    L.overlayGrain(ctx, grains[gf % grains.length], 0.1, 'overlay', Math.floor(r() * 64), Math.floor(r() * 64));
    L.overlayGrain(ctx, dithers[gf % dithers.length], 1, 'lighter', Math.floor(r() * 64), Math.floor(r() * 64));
    vignette(0.12);
  }
  ctx.getImageData(0, 0, 1, 1);
  const drawMs = performance.now() - t0;
  if (guide) K.guide(ctx);
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
  ready, errors, missingFonts, SHOTS, TOTAL_FRAMES, FPS, film: FILM, size: S,
  renderShot, renderFrame,
  preload: async (ids) => { for (const s of SHOTS) if (!ids || ids.includes(s.id)) await ensure(s); return errors.slice(); },
  toDataURL: (type = 'image/png', q) => canvas.toDataURL(type, q),
};
