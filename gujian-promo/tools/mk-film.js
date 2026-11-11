#!/usr/bin/env node
// mk-film.js — scaffold a film of the series from its storyboard.
//   node tools/mk-film.js coins     reads docs/storyboard-coins.json and writes
//                                   src/films/coins/timeline.js  and  src/films/coins/scenes/title.js
// The storyboard supplies: tagline (3 beats), titleCard {title, seal, cta}, shots[37] {id, file, ...}.
// Existing files are NOT overwritten unless --force is given (the timeline is meant to be hand-tuned afterwards).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const film = process.argv[2];
const force = process.argv.includes('--force');
if (!film) { console.error('usage: node tools/mk-film.js <film> [--force]'); process.exit(2); }
const sb = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', `storyboard-${film}.json`), 'utf8'));
const FRAMES = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5];
const beatOf = (i) => (i < 14 ? 0 : i < 19 ? 1 : i < 24 ? 2 : 3);

// ── validate ──
const problems = [];
if (!Array.isArray(sb.shots) || sb.shots.length !== 37) problems.push(`expected 37 shots, got ${sb.shots && sb.shots.length}`);
(sb.shots || []).forEach((s, i) => {
  const id = 's' + String(i + 1).padStart(2, '0');
  if (s.id !== id) problems.push(`shot ${i + 1}: id ${s.id} ≠ ${id}`);
  if (s.frames !== FRAMES[i]) problems.push(`${id}: frames ${s.frames} ≠ ${FRAMES[i]}`);
  if ((s.beat || 0) !== beatOf(i)) problems.push(`${id}: beat ${s.beat} ≠ ${beatOf(i)}`);
  if (!/^s\d\d-[a-z0-9-]+\.js$/.test(s.file || '')) problems.push(`${id}: bad file name ${s.file}`);
  else if (!s.file.startsWith(id + '-')) problems.push(`${id}: file ${s.file} does not start with ${id}-`);
  if (!['light', 'dark'].includes(s.tone)) problems.push(`${id}: tone ${s.tone}`);
});
if (!Array.isArray(sb.tagline) || sb.tagline.length !== 3) problems.push('tagline must have 3 beats');
if (!sb.titleCard || !sb.titleCard.title) problems.push('titleCard.title missing');
if (problems.length) { console.error('storyboard problems:\n ' + problems.join('\n ')); process.exit(1); }

// ── tagline sizes scale with the number of characters so every beat has a similar visual weight ──
const len = (s) => Array.from(s).length;
const b1 = len(sb.tagline[0]), b2 = len(sb.tagline[1]), b3 = len(sb.tagline[2]);
// weight follows stroke density: sparse glyphs (few strokes) get the heavier cut, dense glyphs stay at 600
const dense = (s) => /[藏赢繁鹰瓣鑫麟馨蠡鼎疆鬱]/.test(s) || len(s) >= 5;
const beats = {
  1: Object.assign({ text: sb.tagline[0], size: Math.round(80 * Math.min(1.12, 4 / b1) ** 0.8), gap: 30, weight: 700, spacing: 9, stroke: 1.0 }, sb.tagline[0][0] === '一' ? { kern: [-6] } : {}),
  2: { text: sb.tagline[1], size: Math.round(112 * Math.min(1.08, 2 / b2) ** 0.6), gap: 30, weight: dense(sb.tagline[1]) ? 600 : 700, spacing: 12, stroke: 1.0 },
  3: { text: sb.tagline[2], size: Math.round(160 * Math.min(1.08, 2 / b3) ** 0.7), sizeEnd: Math.round(200 * Math.min(1.08, 2 / b3) ** 0.7), gap: 32, weight: 700, spacing: 14, stroke: 0.8 },
};
const cta = String(sb.titleCard.cta || '').split(/[\s　·，,]+/).filter(Boolean);
const dir = path.join(ROOT, 'src', 'films', film);
fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });

const q = (s) => JSON.stringify(s);
const timeline = `// timeline.js — cut list and typography for 《${sb.titleCard.title}》 (film id: ${film}).
// Generated from docs/storyboard-${film}.json by tools/mk-film.js, then hand-tuned. The cut structure itself is shared: see src/cuts.js.
import { FPS, buildTimeline } from '../../cuts.js';
export { FPS };

// Tagline beats (the reference's "There's / more to / discover" structure)
export const BEATS = {
  1: ${JSON.stringify(beats[1])},
  2: ${JSON.stringify(beats[2])},
  3: ${JSON.stringify(beats[3])},
};

// Typography. \`font\` is the tagline face (see FONTS in lib/core.js); \`title\` styles the closing card.
export const STYLE = {
  font: 'serif',
  title: { font: 'serif' },
};

// The closing card
export const TITLE = { title: ${q(sb.titleCard.title)}, seal: ${q(sb.titleCard.seal || '')}, cta: ${JSON.stringify(cta.length ? cta.slice(0, 2) : ['等你发现'])} };

// 37 scene modules (src/films/${film}/scenes/<name>.js), in cut order; arcs follow DEFAULT_ARCS in cuts.js unless overridden here
export const { SHOTS, TOTAL_FRAMES, shotAt } = buildTimeline([
${sb.shots.map((s) => `  ${q(s.file.replace(/\.js$/, ''))},   // ${s.name}`).join('\n')}
]);
`;
const s01 = sb.shots[0].file.replace(/\.js$/, '');
const title = `// title — 片名卡 for 《${sb.titleCard.title}》. Card logic is shared (lib/titlecard.js); the opening shot supplies the image the camera tilts back onto.
import { makeTitleScene } from '../../../lib/titlecard.js';
import { initOpening, drawOpening, TITLE_TILT } from './${s01}.js';
import { STYLE, TITLE } from '../timeline.js';

export default makeTitleScene({ initOpening, drawOpening, title: TITLE.title, seal: TITLE.seal, cta: TITLE.cta, brand: TITLE.brand, tilt0: TITLE_TILT || 720, style: () => STYLE.title });
`;
const put = (file, text) => {
  if (fs.existsSync(file) && !force) { console.log('exists, kept: ' + path.relative(ROOT, file)); return; }
  fs.writeFileSync(file, text); console.log('wrote ' + path.relative(ROOT, file));
};
put(path.join(dir, 'timeline.js'), timeline);
put(path.join(dir, 'scenes', 'title.js'), title);
console.log(`film ${film}: 「${sb.tagline.join(' / ')}」 → ${sb.titleCard.title} → [${sb.titleCard.seal}] ${cta.join(' ')}`);
