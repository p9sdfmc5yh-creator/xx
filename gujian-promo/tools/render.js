#!/usr/bin/env node
// render.js — render a film (or selected shots) to PNG frames in build/<film>/frames/.  (--film arch|coins|antiques, default arch)
//   node tools/render.js                 → all 500 frames
//   node tools/render.js --shots s05,s06 → only those shots (frames keep their global numbering)
//   node tools/render.js --missing-ok    → shots whose scene file does not exist yet are skipped instead of failing
// Each shot renders in a fresh page so cached layers of earlier scenes are released.
const fs = require('fs');
const path = require('path');
const { openBrowser, dataUrlToBuffer, filmArgs, ROOT } = require('./harness');

(async () => {
  const fa = filmArgs(process.argv.slice(2));
  const args = fa.rest;
  const sIdx = args.indexOf('--shots');
  const only = sIdx >= 0 ? args[sIdx + 1].split(',') : null;
  const missingOk = args.includes('--missing-ok');
  const outDir = fa.framesDir;
  fs.mkdirSync(outDir, { recursive: true });
  const b = await openBrowser(fa.film);
  let page = await b.newPage();
  const shots = await page.evaluate(() => window.GJ.SHOTS.map((s) => ({ id: s.id, scene: s.scene, start: s.start, frames: s.frames })));
  await page.close();
  const t0 = Date.now();
  let failed = [];
  for (const shot of shots) {
    if (only && !only.includes(shot.id)) continue;
    if (!fs.existsSync(path.join(fa.scenesDir, shot.scene + '.js'))) {
      if (missingOk) { console.log(`${shot.id}: scene file missing, skipped`); continue; }
      failed.push(`${shot.id}: scene file missing`); continue;
    }
    page = await b.newPage();
    const ts = Date.now();
    for (let f = 0; f < shot.frames; f++) {
      const n = shot.start + f;
      await page.evaluate((n) => window.GJ.renderFrame(n), n);
      const buf = dataUrlToBuffer(await page.evaluate(() => window.GJ.toDataURL('image/png')));
      fs.writeFileSync(path.join(outDir, `f_${String(n).padStart(5, '0')}.png`), buf);
    }
    const errs = await page.evaluate(() => window.GJ.errors.slice());
    if (errs.length) failed.push(`${shot.id}: ${errs[0].split('\n')[0]}`);
    console.log(`${shot.id} ${shot.scene}: ${shot.frames} frames in ${((Date.now() - ts) / 1000).toFixed(1)} s${errs.length ? '  ERRORS' : ''}`);
    await page.close();
  }
  await b.close();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (failed.length) { console.error('FAILED:\n ' + failed.join('\n ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
