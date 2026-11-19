// Opens /ask/ on the built site, taps each example question under the
// greeting, and fails when a reply is "I found nothing", empty, or links a
// tool page that does not load. The rule and its history are in
// ask-examples.mjs.
//
//   node platform/pages/ask-check.mjs           # serves dist itself
//   node platform/pages/ask-check.mjs --all     # print every reply, not just failures
//
// Same DIST / BASE_URL / PLAYWRIGHT / CHROME_PATH variables as fold-check.mjs.
// The default (rule-based) engine only: no model is downloaded or called.
// Exits 0 when every example passes, 1 listing each one that does not, 2 when
// nothing could be checked (no build, no Playwright, nothing answering at
// BASE_URL, no example buttons on the page).
// Not part of CI: Playwright is not a dependency of this repo.

import { requirePlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askFailures } from './ask-examples.mjs';
import { ASK_PATH } from './assistant.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.DIST || path.join(HERE, 'dist'));
const SHOW_ALL = process.argv.includes('--all') || process.env.ALL === '1';
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

if (!process.env.BASE_URL && !fs.existsSync(path.join(DIST, ASK_PATH, 'index.html'))) {
  console.error(`No built /${ASK_PATH} at ${DIST}. Run: node platform/pages/build.mjs`);
  process.exit(2);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** A static server for DIST on a free 127.0.0.1 port; paths cannot leave DIST. */
async function serveDist() {
  const srv = http.createServer((q, r) => {
    let rel;
    try { rel = decodeURIComponent(new URL(q.url, 'http://x').pathname); } catch { rel = '/'; }
    let p = path.join(DIST, rel);
    if (p !== DIST && !p.startsWith(DIST + path.sep)) { r.writeHead(403); r.end(); return; }
    if (rel.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((ok, fail) => { srv.once('error', fail); srv.listen(0, '127.0.0.1', ok); });
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}

const playwright = await requirePlaywright();
let server = null;
let BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (BASE) {
  try {
    await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.error(`Nothing answers at BASE_URL ${BASE} (${e.cause?.code || e.message}). Unset BASE_URL and ask-check serves ${DIST} itself.`);
    process.exit(2);
  }
} else {
  server = await serveDist();
  BASE = server.base;
}

const askUrl = `${BASE}/${ASK_PATH}`;
const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});
const replies = [];
let questions = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(askUrl, { waitUntil: 'load', timeout: 30000 });
  const tryButtons = '#pf-assistant .pa-try button';
  try {
    await page.waitForSelector(tryButtons, { timeout: 10000 });
  } catch {
    console.error(`No example questions (${tryButtons}) on ${askUrl}.`);
    process.exit(2);
  }
  questions = await page.$$eval(tryButtons, (bs) => bs.map((b) => b.textContent.trim()));

  for (const [i, question] of questions.entries()) {
    // A fresh page per question: asking removes the row of examples.
    if (i > 0) {
      await page.goto(askUrl, { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector(tryButtons, { timeout: 10000 });
    }
    const before = await page.locator('#pf-assistant .pa-bot').count();
    await page.locator(tryButtons).nth(i).click();
    let reply = null;
    try {
      await page.waitForFunction(
        (n) => document.querySelectorAll('#pf-assistant .pa-bot').length > n,
        before,
        { timeout: 15000 },
      );
      reply = await page.evaluate(() => {
        const bots = document.querySelectorAll('#pf-assistant .pa-bot');
        const last = bots[bots.length - 1];
        return {
          text: last.querySelector('span')?.textContent || '',
          links: [...last.querySelectorAll('ul a[href]')].map((a) => a.href),
        };
      });
    } catch { /* no reply: reported below */ }
    if (reply) {
      reply.dead = [];
      for (const href of reply.links) {
        const url = new URL(href, askUrl);
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (!res || !res.ok) reply.dead.push(url.pathname);
      }
      reply.links = reply.links.map((h) => new URL(h, askUrl).pathname);
    }
    replies.push({ question, reply });
  }
  await context.close();
} finally {
  await browser.close();
  server?.srv.close();
}

if (SHOW_ALL) {
  for (const { question, reply } of replies) {
    console.log(`\n${question}\n  ${reply ? reply.text.replace(/\n/g, '\n  ') : '(no reply)'}`);
    for (const l of reply?.links || []) console.log(`  -> ${l}`);
  }
  console.log('');
}
const failures = askFailures(replies);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log(`All ${questions.length} example questions on /${ASK_PATH} answer, and every tool they link loads.`);
