#!/usr/bin/env node
// preview.js — render stills of one or more shots so you can LOOK at them.
//   node tools/preview.js s02            → build/preview/s02_sheet.jpg  (2×2: start, middle, end, middle+guides)
//                                          build/preview/s02_mid.jpg    (full-res 1920×1080 middle frame, with tagline text if the shot has one)
//   node tools/preview.js s02 s07 --notext   (hide the tagline overlay)
//   node tools/preview.js s02 --p 0.25       (extra full-res still at progress 0.25 → s02_p25.jpg)
//   node tools/preview.js s02 --film coins   (another film of the series → build/coins/preview/)
//   node tools/preview.js s02 --out some/dir   (write somewhere else, e.g. for a review that must not touch the shared preview folder)
// Each run also writes <id>_compare.jpg — the reference film's frames of the same shot next to ours (see tools/compare.py).
// Exit code 1 if the scene threw or logged errors.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { openPlayer, dataUrlToBuffer, filmArgs, ROOT } = require('./harness');

(async () => {
  const fa = filmArgs(process.argv.slice(2));
  const args = fa.rest;
  const ids = args.filter((a) => /^(s\d\d|title)$/.test(a));
  const noText = args.includes('--notext');
  const pIdx = args.indexOf('--p');
  const extraP = pIdx >= 0 ? parseFloat(args[pIdx + 1]) : null;
  if (!ids.length) { console.error('usage: node tools/preview.js <shotId...> [--notext] [--p 0.25]'); process.exit(2); }
  const oIdx = args.indexOf('--out');
  const outDir = oIdx >= 0 ? path.resolve(args[oIdx + 1]) : fa.previewDir;
  fs.mkdirSync(outDir, { recursive: true });
  const { page, logs, close } = await openPlayer(fa.film);
  let failed = false;
  for (const id of ids) {
    const shots = [];
    const grab = async (p, opts, name) => {
      const info = await page.evaluate(async ([id, p, opts]) => window.GJ.renderShot(id, p, opts), [id, p, opts]);
      const buf = dataUrlToBuffer(await page.evaluate(() => window.GJ.toDataURL('image/jpeg', 0.92)));
      const f = path.join(outDir, `${id}_${name}.jpg`);
      fs.writeFileSync(f, buf);
      return { f, info };
    };
    const a = await grab(0, { text: !noText }, 'tmp-start');
    const b = await grab(0.5, { text: !noText }, 'mid');
    const c = await grab(1, { text: !noText }, 'tmp-end');
    const g = await grab(0.5, { text: true, guide: true }, 'tmp-guide');
    if (extraP !== null) await grab(extraP, { text: !noText }, 'p' + Math.round(extraP * 100));
    // 2×2 contact sheet (each tile 960×540)
    const sheet = path.join(outDir, `${id}_sheet.jpg`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', a.f, '-i', b.f, '-i', c.f, '-i', g.f,
      '-filter_complex', '[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0', '-q:v', '3', sheet]);
    const errs = await page.evaluate(() => window.GJ.errors.splice(0));
    const frames = await page.evaluate((id) => window.GJ.SHOTS.find((s) => s.id === id).frames, id);
    console.log(`${id}: init ${a.info.initMs.toFixed(0)} ms, draw ${b.info.drawMs.toFixed(0)} ms/frame, ${frames} frames (${(frames / 25).toFixed(2)} s)`);
    console.log(`  sheet: ${sheet}\n  mid:   ${b.f}`);
    if (errs.length) { failed = true; console.log('  ERRORS:\n   ' + errs.join('\n   ')); }
    // side-by-side with the reference film (skipped silently when the reference stills are not on this machine)
    try {
      const lines = execFileSync('python3', [path.join(ROOT, 'tools', 'compare.py'), '--dir', outDir, '--label', fa.film, id], { encoding: 'utf8' }).trim().split('\n');
      const cmp = (lines[0] || '').trim(); const zm = (lines.find((l) => l.startsWith('ZOOM ')) || '').slice(5).trim();
      if (cmp) console.log(`  compare: ${cmp}\n  ↑ 左半是参考片的同一镜头，右半是你的画面。每一轮都要用 Read 打开这张图逐项对比（主体大小与画面填充、明暗层次、质感密度、光与景深、色彩干净程度），差在哪就改哪；细则见 docs/AUTHORING.md「对照参考片」。`);
      if (zm) console.log(`  zoom:    ${zm}\n  ↑ 三处原始像素（1:1）局部。客户要求「每一帧要画得够细腻」：每一轮都用 Read 打开这张图，检查有没有粗颗粒、锯齿、色带、马赛克块、糊边、点阵抖动；细则见 docs/AUTHORING.md「细腻」。`);
    } catch (e) { /* comparison is a convenience; never fail a preview because of it */ }
    [a.f, c.f, g.f].forEach((f) => fs.unlinkSync(f));
  }
  if (logs.length) { console.log('browser log:\n ' + logs.slice(0, 20).join('\n ')); if (logs.some((l) => l.includes('pageerror'))) failed = true; }
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
