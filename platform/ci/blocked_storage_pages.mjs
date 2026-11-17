#!/usr/bin/env node
// Load venture pages in Chromium with site data blocked and list the ones
// whose scripts throw on the `localStorage` getter at load.
//
// With "block all cookies" (Chrome), cookies blocked (Safari) and in some
// embedded webviews, merely reading the `localStorage` global throws
// SecurityError, `typeof localStorage` included. A read outside try at
// start-up stops the page's whole script: no result, no share link, no draft.
// check_storage_guard.py catches the common shapes as text; this is the
// behavioural check behind it (red team 2026-11-14: 38 of 3,820 pages threw,
// 21 on a bare `typeof` probe, 9 through a module's default parameter, 8 on a
// start-up read in the page itself; all fixed the same day).
//
//   node platform/ci/blocked_storage_pages.mjs [--jobs 6] [page.html ...]
//
// With no pages it loads every tracked ventures/**/*.html (about 7 minutes).
// Exit 1 when any page throws. Pages are served from a local static server;
// every other host is aborted, so nothing leaves the machine.
import { execFileSync } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const MARK = 'blocked-storage-sweep';

function args(argv) {
  const out = { jobs: 6, pages: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--jobs') out.jobs = Number(argv[++i]) || 6;
    else out.pages.push(argv[i]);
  }
  return out;
}

function serve() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try { if (statSync(file).isDirectory()) file = path.join(file, 'index.html'); statSync(file); } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const opts = args(process.argv.slice(2));
  const pages = opts.pages.length ? opts.pages.map((p) => path.relative(ROOT, path.resolve(p)))
    : execFileSync('git', ['ls-files', 'ventures/*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((p) => p && !p.includes('node_modules'));
  const { chromium } = createRequire(import.meta.url)('playwright');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route((url) => !url.href.startsWith(base), (route) => route.abort());
  await ctx.addInitScript((mark) => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException(mark, 'SecurityError'); } });
  }, MARK);
  const bad = [];
  let next = 0;
  async function worker() {
    while (next < pages.length) {
      const page = pages[next++];
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('pageerror', (e) => { if (String(e.message).includes(MARK)) errors.push(e); });
      try { await tab.goto(base + page, { timeout: 15000 }); await tab.waitForTimeout(400); } catch { /* a slow page is not this check */ }
      if (errors.length) bad.push(page);
      await tab.close();
    }
  }
  await Promise.all(Array.from({ length: opts.jobs }, worker));
  await browser.close();
  server.close();
  for (const page of bad.sort()) console.log(`${page}: a script throws on the localStorage getter at load`);
  console.log(`${bad.length} of ${pages.length} page(s) stop when site data is blocked`);
  process.exitCode = bad.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; });
