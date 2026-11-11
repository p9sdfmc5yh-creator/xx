// titlecard.js — the closing title card shared by every film in the series.
// Mirrors the reference's ending: hard cut to a dark, quiet space above the opening image, card A (the title) holds,
// hard cut to card B (seal + call to action), then the camera tilts back down onto the opening shot so the film loops.
import * as L from './core.js';

const CUT_B = 33;        // frame within the shot where card B replaces card A  → 17.28 s
const TILT_START = 50;   // frame where the tilt-down begins                     → 17.96 s

/** a small vermilion seal with two stacked characters (carved-stone look: near-square corners, worn edges, a slight tilt) */
export function drawSeal(ctx, x, y, size, chars, opts = {}) {
  const { color = '#b3261e', ink = '#f7f2e8', font = 'serif', weight = 900, seed = 'seal', radius = 0.06, charScale = 0.5, rotate = -0.026 } = opts;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rotate);
  const r = L.rng(seed);
  // paint on a private canvas so the "wear" only erases the seal, not the picture behind it
  const pad = 8, c = L.makeCanvas(size + pad * 2, size + pad * 2), g = c.getContext('2d');
  g.translate(pad + size / 2, pad + size / 2);
  g.fillStyle = color;
  const h = size / 2, rad = size * radius;
  g.beginPath();
  g.moveTo(-h + rad, -h); g.lineTo(h - rad, -h); g.quadraticCurveTo(h, -h, h, -h + rad);
  g.lineTo(h, h - rad); g.quadraticCurveTo(h, h, h - rad, h); g.lineTo(-h + rad, h); g.quadraticCurveTo(-h, h, -h, h - rad);
  g.lineTo(-h, -h + rad); g.quadraticCurveTo(-h, -h, -h + rad, -h); g.closePath(); g.fill();
  // uneven seal paste
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.45;
  g.drawImage(L.noiseTex(size, size, { seed: seed + 'ink', scale: 40, octaves: 2, contrast: 1.2, res: 1, ramp: [[0, 'rgba(120,16,10,0.4)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(255,130,100,0.3)']] }), -h, -h);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const cs = Array.from(chars);
  const fs = size * charScale;
  L.text(g, cs[0] || '', 0, -size * 0.235, { font, size: fs, weight, color: ink });
  L.text(g, cs[1] || '', 0, size * 0.235, { font, size: fs, weight, color: ink });
  // worn stone edges and a few pits
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const px = r.range(-h, h), py = r.range(-h, h);
    const edge = Math.max(Math.abs(px), Math.abs(py)) / h;
    if (r() > Math.pow(edge, 4) + 0.012) continue;
    g.globalAlpha = r.range(0.3, 1);
    g.beginPath(); g.ellipse(px, py, r.range(0.5, 2.6), r.range(0.5, 1.9), r() * 3, 0, L.TAU); g.fill();
  }
  ctx.drawImage(c, -size / 2 - pad, -size / 2 - pad);
  ctx.restore();
}

/** where the brand line sits in the opening picture: this many px below the crest of the arc */
export const BRAND_DY = 196;
const BRAND_STYLE = { font: 'serif', size: 116, weight: 600, spacing: 46, ink: '#f7f2e8', alpha: 0.96 };

/**
 * The brand line (e.g. a shop or company name) that opens and closes a film. In the opening shot it sits in the dark, quiet
 * area under the horizon. On the closing card it cuts in with card B at exactly that place and holds still while the camera
 * tilts back down, so the last frame equals the first. `smear` (px) is an optional vertical motion blur.
 */
export function drawBrand(ctx, brand, y, style = {}, smear = 0, halo = 0.34) {
  if (!brand) return;
  const st = Object.assign({}, BRAND_STYLE, style || {});
  if (y - st.size > L.H + 40) return;
  const passes = smear > 1.5 ? 7 : 1;
  ctx.save();
  for (let i = 0; i < passes; i++) {
    const o = passes === 1 ? 0 : L.lerp(-smear, smear, i / (passes - 1));
    // a soft, shapeless dimming under the letters so they hold on any picture, then the letters themselves
    ctx.save(); ctx.filter = `blur(${Math.round(st.size * (0.2 + 0.1 * Math.max(0, halo - 0.34)))}px)`; ctx.globalAlpha = Math.min(1, halo) / passes;
    L.text(ctx, brand, L.W / 2, y + o, { font: st.font, size: st.size, weight: st.weight, color: '#000', spacing: st.spacing, stroke: { color: '#000', width: st.size * 0.12 } });
    ctx.restore();
    ctx.globalAlpha = st.alpha / passes;
    L.text(ctx, brand, L.W / 2, y + o, { font: st.font, size: st.size, weight: st.weight, color: st.ink, spacing: st.spacing });
  }
  ctx.restore();
}

/**
 * makeTitleScene({
 *   initOpening(env), drawOpening(ctx, env, {tilt, k}),   // the film's opening shot, drawable with the camera tilted up by `tilt` px
 *   title: '中国古建筑', seal: '营造', cta: ['千年营造', '等你发现'],
 *   brand: '…',                 // optional brand line that sits under the horizon of the opening picture (see drawBrand)
 *   tilt0: 720,                 // how far up the camera looks while the cards are on screen
 *   dim: 0.35, dimColor: '#05070b',   // extra darkening of the sky behind the cards
 *   style: { font, titleSize, titleWeight, titleSpacing, ctaSize, ctaWeights: [600, 300], ink, sealColor, sealFont, y }
 * })
 */
export function makeTitleScene(cfg) {
  const { initOpening, drawOpening, title, seal, cta, tilt0 = 720, dim = 0.35, dimColor = '#05070b', brand = null } = cfg;
  // style may be an object or a function returning one (resolved every frame, so typography can be swapped at runtime)
  const style = () => Object.assign({ font: 'serif', titleSize: 98, titleWeight: 500, titleSpacing: 28, ctaSize: 56, ctaWeights: [600, 400], ctaSpacing: 8, ctaGap: 0.75,
    ink: '#f7f2e8', sealColor: '#b3261e', sealFont: 'serif', sealWeight: 900, sealSize: 82, y: 498 }, (typeof cfg.style === 'function' ? cfg.style() : cfg.style) || {});
  return {
    name: '片名卡',
    tone: 'light',
    init(env) { if (initOpening) initOpening(env); },
    draw(ctx, env) {
      const st = style();
      const f = env.frame, n = env.frames;
      const prog = (ff) => L.ease.inOutCubic(L.clamp((ff - TILT_START) / (n - 1 - TILT_START)));
      const e = prog(f);
      drawOpening(ctx, env, { tilt: tilt0 * (1 - e), k: 0 });
      // keep the space behind the cards dark and quiet until the tilt reveals the opening image again
      ctx.save(); ctx.globalAlpha = dim * (1 - e); ctx.fillStyle = dimColor; ctx.fillRect(0, 0, L.W, L.H); ctx.restore();
      // the brand line: it cuts in with card B at the very place it holds in the opening picture, and never moves —
      // the call to action rides up and away with the camera, the horizon rises behind the name and settles just above it,
      // so the film ends (and loops) on the brand
      if (brand && f >= CUT_B) {
        // while the bright rim of the horizon passes behind the name, deepen the soft shadow under the letters so they stay readable
        const d = tilt0 * (1 - e) - BRAND_DY;                       // px the horizon still has to rise to reach the name's centre line
        const glow = L.clamp((d + 90) / 110) * L.clamp((330 - d) / 220);
        drawBrand(ctx, brand, env.arc.crestY + BRAND_DY, st.brand, 0, 0.34 + 0.5 * glow);
      }
      if (f < CUT_B) {
        L.text(ctx, title, L.W / 2, st.y, { font: st.font, size: st.titleSize, weight: st.titleWeight, color: st.ink, spacing: st.titleSpacing });
        return;
      }
      // card B rides upward out of frame as the camera tilts down, with a little vertical motion blur
      const y = st.y - tilt0 * e;
      if (y < -180) return;
      const speed = f > TILT_START ? tilt0 * (prog(f + 0.5) - prog(f - 0.5)) : 0;
      const smear = Math.min(22, speed * 0.55);
      const passes = smear > 1.5 ? 7 : 1;
      // measure the group so it is centred as a whole: [seal] gap [cta0] gap [cta1]
      ctx.save();
      const fam = L.FONTS[st.font] || st.font;
      const widthOf = (str, weight) => { ctx.font = `${weight} ${st.ctaSize}px ${fam}`; return Array.from(str).reduce((w, ch) => w + ctx.measureText(ch).width, 0) + st.ctaSpacing * (Array.from(str).length - 1); };
      const w0 = widthOf(cta[0], st.ctaWeights[0]), w1 = cta[1] ? widthOf(cta[1], st.ctaWeights[1]) : 0;
      ctx.restore();
      const gapSeal = st.ctaSize * 0.5, gapMid = st.ctaSize * st.ctaGap;
      const total = st.sealSize + gapSeal + w0 + (cta[1] ? gapMid + w1 : 0);
      const x0 = L.W / 2 - total / 2;
      ctx.save();
      for (let i = 0; i < passes; i++) {
        const o = passes === 1 ? 0 : L.lerp(-smear, smear, i / (passes - 1));
        ctx.globalAlpha = 1 / passes;
        drawSeal(ctx, x0 + st.sealSize / 2, y + o + 2, st.sealSize, seal, { color: st.sealColor, ink: st.ink, font: st.sealFont, weight: st.sealWeight });
        L.text(ctx, cta[0], x0 + st.sealSize + gapSeal, y + o, { font: st.font, size: st.ctaSize, weight: st.ctaWeights[0], color: st.ink, align: 'left', spacing: st.ctaSpacing });
        if (cta[1]) L.text(ctx, cta[1], x0 + st.sealSize + gapSeal + w0 + gapMid, y + o, { font: st.font, size: st.ctaSize, weight: st.ctaWeights[1], color: st.ink, align: 'left', spacing: st.ctaSpacing });
      }
      ctx.restore();
    },
  };
}
