#!/usr/bin/env node
// specimen.js — typography specimens on real frames, one sheet per candidate type system.
//   node tools/specimen.js [--film arch] [--shots s15,s21,s25,s32]
// Writes build/<film>/specimen/<candidate>.jpg : full-resolution crops around the tagline for a few shots,
// plus both title cards, so typefaces can be judged in context (dark / light / busy backgrounds).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { openPlayer, dataUrlToBuffer, filmArgs, ROOT } = require('./harness');

const CANDIDATES = [
  { key: 'A-song-semibold', label: 'A 思源宋体 SemiBold（现用）', style: { font: 'serif', beats: { 1: { weight: 600 }, 2: { weight: 600 }, 3: { weight: 700 } }, title: { font: 'serif', titleWeight: 600, ctaWeights: [600, 300] } } },
  { key: 'B-song-heavy', label: 'B 思源宋体 Heavy', style: { font: 'serif', beats: { 1: { weight: 800 }, 2: { weight: 800 }, 3: { weight: 900 } }, title: { font: 'serif', titleWeight: 800, ctaWeights: [800, 400] } } },
  { key: 'C-song-light', label: 'C 思源宋体 Light/Regular（纤细）', style: { font: 'serif', beats: { 1: { weight: 400 }, 2: { weight: 400 }, 3: { weight: 500 } }, title: { font: 'serif', titleWeight: 400, ctaWeights: [500, 300] } } },
  { key: 'D-wenkai', label: 'D 霞鹜文楷 Medium', style: { font: '"GJ WenKai"', beats: { 1: { weight: 400 }, 2: { weight: 400 }, 3: { weight: 400 } }, title: { font: '"GJ WenKai"', titleWeight: 400, ctaWeights: [400, 400] } } },
  { key: 'E-xiaowei', label: 'E 站酷小薇', style: { font: 'xiaowei', beats: { 1: { weight: 400 }, 2: { weight: 400 }, 3: { weight: 400 } }, title: { font: 'xiaowei', titleWeight: 400, ctaWeights: [400, 400] } } },
  { key: 'F-mashanzheng', label: 'F 马善政楷书（毛笔楷）', style: { font: 'brush', beats: { 1: { weight: 400 }, 2: { weight: 400 }, 3: { weight: 400 } }, title: { font: 'brush', titleWeight: 400, ctaWeights: [400, 400] } } },
  { key: 'G-longcang', label: 'G 龙藏体（行书）', style: { font: '"GJ LongCang"', beats: { 1: { weight: 400 }, 2: { weight: 400 }, 3: { weight: 400 } }, title: { font: '"GJ LongCang"', titleWeight: 400, ctaWeights: [400, 400] } } },
  { key: 'H-zhimang', label: 'H 志莽行书', style: { font: '"GJ ZhiMang"', beats: { 1: { weight: 400 }, 2: { weight: 400 }, 3: { weight: 400 } }, title: { font: '"GJ ZhiMang"', titleWeight: 400, ctaWeights: [400, 400] } } },
  { key: 'I-song-plus-brush', label: 'I 混排：前两拍思源宋体 + 末拍马善政楷书，片名宋体', style: { font: 'serif', beats: { 1: { weight: 500, font: 'serif' }, 2: { weight: 500, font: 'serif' }, 3: { weight: 400, font: 'brush' } }, title: { font: 'serif', titleWeight: 600, ctaWeights: [600, 300] } } },
];

(async () => {
  const fa = filmArgs(process.argv.slice(2));
  const sIdx = fa.rest.indexOf('--shots');
  const shots = sIdx >= 0 ? fa.rest[sIdx + 1].split(',') : ['s15', 's21', 's25', 's32'];
  const outDir = path.join(ROOT, 'build', fa.film, 'specimen');
  fs.mkdirSync(outDir, { recursive: true });
  const { page, close } = await openPlayer(fa.film);
  const info = await page.evaluate(() => window.GJ.SHOTS.map((s) => ({ id: s.id, crestY: s.arc.crestY })));
  const base = await page.evaluate(() => JSON.stringify({ beats: window.GJ.SHOTS.length }));
  const tiles = [...shots.map((id) => ({ id, frame: null })), { id: 'title', frame: 12 }, { id: 'title', frame: 42 }];
  for (const c of CANDIDATES) {
    // reset per-beat font overrides from the previous candidate, then apply this one
    await page.evaluate((st) => { window.GJ.setStyle({ beats: { 1: { font: undefined }, 2: { font: undefined }, 3: { font: undefined } } }); window.GJ.setStyle(st); }, c.style);
    const files = [];
    for (let k = 0; k < tiles.length; k++) {
      const t = tiles[k];
      await page.evaluate(async ([id, frame]) => window.GJ.renderShot(id, 0.5, frame === null ? {} : { frame }), [t.id, t.frame]);
      const f = path.join(outDir, `_${c.key}_${k}.png`);
      fs.writeFileSync(f, dataUrlToBuffer(await page.evaluate(() => window.GJ.toDataURL('image/png'))));
      files.push({ f, crestY: t.id === 'title' ? 620 : info.find((s) => s.id === t.id).crestY });
    }
    // crop 960×420 around the text of each tile, tile 2 columns
    const inputs = files.flatMap((x) => ['-i', x.f]);
    const crops = files.map((x, i) => `[${i}]crop=960:420:480:${Math.max(0, x.crestY - 330)}[c${i}]`).join(';');
    const layout = files.map((_, i) => `${(i % 2) * 960}_${Math.floor(i / 2) * 420}`).join('|');
    const out = path.join(outDir, `${c.key}.jpg`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex',
      `${crops};${files.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}`, '-q:v', '2', out]);
    files.forEach((x) => fs.unlinkSync(x.f));
    console.log(`${c.label}  →  ${out}`);
  }
  await close();
  fs.writeFileSync(path.join(outDir, 'candidates.json'), JSON.stringify(CANDIDATES.map(({ key, label, style }) => ({ key, label, style })), null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
