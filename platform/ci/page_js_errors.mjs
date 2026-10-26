// Loads every ventures/**/index.html in headless Chromium and reports uncaught
// exceptions and console errors. Failed network loads are ignored (offline sweep).
// Usage: node platform/ci/page_js_errors.mjs   (needs playwright; exit 1 on any error)
import http from 'http';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(0);
await new Promise((r) => server.on('listening', r));
const port = server.address().port;

const files = cp.execSync("find ventures -name index.html -not -path '*/node_modules/*' -not -path '*/test*'").toString().trim().split('\n');
const browser = await chromium.launch();
const ctx = await browser.newContext();
const bad = [];
let next = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 150)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 150));
    });
    try {
      await page.goto(`http://localhost:${port}/${f}`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(150);
    } catch (e) { errs.push('nav: ' + e.message.slice(0, 80)); }
    if (errs.length) bad.push([f, errs]);
    await page.close();
  }
}
await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
await browser.close();
server.close();
console.log(`${files.length} pages; ${bad.length} with JS errors`);
for (const [f, e] of bad) console.log(f, JSON.stringify(e));
process.exit(bad.length ? 1 : 0);
