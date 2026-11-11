// harness.js — static file server + headless Chromium page with the player loaded.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const file = path.normalize(path.join(ROOT, urlPath));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  try { return require('/opt/node-tools/node_modules/playwright'); } catch (e) { /* fall through */ }
  throw new Error('playwright not found: run `npm i playwright && npx playwright install chromium`');
}

// ── render slots ──
// Every preview / render launches a headless Chromium that can take well over a gigabyte. When dozens of authors
// preview at once the machine runs out of memory (it has happened: the container was restarted). So only a few
// browsers may run at the same time, across ALL processes; the others wait their turn here.
const os = require('os');
const SLOT_DIR = path.join(os.tmpdir(), 'gj-render-slots');
const SLOTS = Math.max(1, parseInt(process.env.GJ_RENDER_SLOTS || '3', 10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
/** kill headless browsers whose parent process is gone (a preview that was killed mid-run leaves them behind, holding memory) */
function reapOrphans() {
  try {
    const out = require('child_process').execSync('ps -eo pid=,ppid=,args=', { encoding: 'utf8', maxBuffer: 8 << 20 });
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/); if (!m) continue;
      const [, pid, ppid, args] = m;
      if (ppid === '1' && /chrom/i.test(args) && /--headless|playwright|pw-browsers/.test(args)) { try { process.kill(parseInt(pid, 10), 'SIGKILL'); } catch (e) { /* gone */ } }
    }
  } catch (e) { /* ps not available: nothing to do */ }
}
function memAvailableMB() {
  try { const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/); return m ? parseInt(m[1], 10) / 1024 : Infinity; } catch (e) { return Infinity; }
}
async function acquireSlot() {
  fs.mkdirSync(SLOT_DIR, { recursive: true });
  reapOrphans();
  // never start a browser when memory is nearly gone: wait (for up to ten minutes) until others have finished
  for (let i = 0; memAvailableMB() < 3000 && i < 600; i++) { if (i === 0) console.error('[render queue] less than 3 GB of memory available — waiting'); if (i % 30 === 29) reapOrphans(); await sleep(1000); }
  const t0 = Date.now();
  let told = false;
  for (;;) {
    for (let i = 0; i < SLOTS; i++) {
      const f = path.join(SLOT_DIR, `slot-${i}.lock`);
      try {
        const fd = fs.openSync(f, 'wx');
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
        const release = () => { try { if (fs.readFileSync(f, 'utf8') === String(process.pid)) fs.unlinkSync(f); } catch (e) { /* already gone */ } };
        process.once('exit', release);
        for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { release(); process.exit(130); });
        if (told) console.error(`[render queue] got a slot after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        return release;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        // a lock left behind by a process that was killed
        try { const pid = parseInt(fs.readFileSync(f, 'utf8'), 10); if (!pid || !alive(pid)) fs.unlinkSync(f); } catch (e2) { /* raced with someone else */ }
      }
    }
    if (!told && Date.now() - t0 > 4000) { told = true; console.error(`[render queue] all ${SLOTS} render slots are busy — waiting for a turn (this is normal; do not start another preview)`); }
    await sleep(400 + Math.floor(Math.abs(Math.sin(process.pid + Date.now())) * 600));
  }
}

async function openBrowser(film) {
  const releaseSlot = await acquireSlot();
  const query = film && film !== 'arch' ? `?film=${encodeURIComponent(film)}` : '';
  const { chromium } = loadPlaywright();
  const { server, port } = await startServer();
  const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--js-flags=--max-old-space-size=3072'] });
  const logs = [];
  const newPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/src/player.html${query}`);
    await page.waitForFunction(() => window.GJ && window.GJ.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.GJ.ready);
    return page;
  };
  const close = async () => { try { await browser.close(); } finally { server.close(); releaseSlot(); } };
  return { browser, server, port, logs, newPage, close, ROOT };
}

async function openPlayer(film) {
  const b = await openBrowser(film);
  const page = await b.newPage();
  return { ...b, page };
}

function dataUrlToBuffer(u) { return Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'); }

/** parse `--film <name>` from argv (default 'arch') and return the film plus its build directories */
function filmArgs(argv) {
  const i = argv.indexOf('--film');
  const film = i >= 0 ? argv[i + 1] : 'arch';
  const rest = argv.filter((a, k) => !(i >= 0 && (k === i || k === i + 1)));
  const previewDir = film === 'arch' ? path.join(ROOT, 'build', 'preview') : path.join(ROOT, 'build', film, 'preview');
  const framesDir = path.join(ROOT, 'build', film, 'frames');
  const scenesDir = film === 'arch' ? path.join(ROOT, 'src', 'scenes') : path.join(ROOT, 'src', 'films', film, 'scenes');
  return { film, rest, previewDir, framesDir, scenesDir };
}

module.exports = { openBrowser, openPlayer, dataUrlToBuffer, filmArgs, ROOT };
