#!/usr/bin/env node
// preview2.js — stills of one or more plates of a SQUARE film (1080 × 1080, e.g. coins2) so you can LOOK at them.
//   node tools/preview2.js g07 --film coins2        → build/coins2/preview/g07_mid.jpg     full-resolution middle frame
//                                                      build/coins2/preview/g07_sheet.jpg   2×2: first / middle / last / middle + glyph guide
//                                                      build/coins2/preview/g07_zoom.jpg    three 1:1 crops of the middle frame
//                                                      build/coins2/preview/g07_compare.jpg the reference film's plate (left) next to ours (right)
//   node tools/preview2.js p01 --film coins2 --p 0.25   (extra still at progress 0.25)      --out some/dir  (write elsewhere)
// Exit code 1 if the scene threw or logged errors.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { openPlayer, dataUrlToBuffer, filmArgs, ROOT } = require('./harness');

(async () => {
  const fa = filmArgs(process.argv.slice(2));
  const args = fa.rest;
  const ids = args.filter((a) => /^([a-z]\d{1,2}|title|brand)$/.test(a));
  const pIdx = args.indexOf('--p');
  const extraP = pIdx >= 0 ? parseFloat(args[pIdx + 1]) : null;
  if (!ids.length) { console.error('usage: node tools/preview2.js <plateId...> --film coins2 [--p 0.25] [--out dir]'); process.exit(2); }
  const oIdx = args.indexOf('--out');
  const outDir = oIdx >= 0 ? path.resolve(args[oIdx + 1]) : fa.previewDir;
  fs.mkdirSync(outDir, { recursive: true });
  const { page, logs, close } = await openPlayer(fa.film);
  let failed = false;
  for (const id of ids) {
    const grab = async (p, opts, name) => {
      const info = await page.evaluate(async ([id, p, opts]) => window.GJ.renderShot(id, p, opts), [id, p, opts]);
      const buf = dataUrlToBuffer(await page.evaluate(() => window.GJ.toDataURL('image/jpeg', 0.95)));
      const f = path.join(outDir, `${id}_${name}.jpg`);
      fs.writeFileSync(f, buf);
      return { f, info };
    };
    const a = await grab(0, {}, 'tmp-start');
    const b = await grab(0.5, {}, 'mid');
    await grab(1, {}, 'tmp-end');
    await grab(0.5, { guide: true }, 'tmp-guide');
    if (extraP !== null) await grab(extraP, {}, 'p' + Math.round(extraP * 100));
    const errs = await page.evaluate(() => window.GJ.errors.splice(0));
    const frames = await page.evaluate((id) => window.GJ.SHOTS.find((s) => s.id === id).frames, id);
    console.log(`${id}: init ${a.info.initMs.toFixed(0)} ms, draw ${b.info.drawMs.toFixed(0)} ms/frame, ${frames} frames (${(frames / 25).toFixed(2)} s)`);
    if (errs.length) { failed = true; console.log('  ERRORS:\n   ' + errs.join('\n   ')); }
    try {
      const out = execFileSync('python3', [path.join(ROOT, 'tools', 'sheet2.py'), '--film', fa.film, '--dir', outDir, id], { encoding: 'utf8' }).trim();
      console.log(out.split('\n').map((l) => '  ' + l).join('\n'));
      console.log('  ↑ 每一轮都用 Read 打开 sheet（首 / 中 / 末 / 符号参考线）、zoom（三处 1:1 原始像素）和 compare（左：参考片的对应图版，右：你的）。');
    } catch (e) { console.log('  (sheet2.py failed: ' + String(e.message).split('\n')[0] + ')'); }
  }
  if (logs.length) { console.log('browser log:\n ' + logs.slice(0, 20).join('\n ')); if (logs.some((l) => l.includes('pageerror'))) failed = true; }
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
