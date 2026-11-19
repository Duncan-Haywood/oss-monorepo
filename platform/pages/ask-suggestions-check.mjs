// Opens the built /ask/ page, taps each example question under the greeting
// with the default (rule-based) engine, and fails when an answer is empty,
// misses what ask-suggestions.mjs expects of it, or links a page that does not load.
//
//   node platform/pages/ask-suggestions-check.mjs          # serves dist itself
//   BASE_URL=https://marisstella.app node platform/pages/ask-suggestions-check.mjs
//
// Same DIST / PLAYWRIGHT / CHROME_PATH / BASE_URL variables as fold-check.mjs.
// Exits 0 when every question gets a good answer, 1 listing each one that does
// not (or a question the page shows that has no expectation), 2 when nothing
// could be checked (no build, no Playwright, no example row on the page).
// Not part of CI: Playwright is not a dependency of this repo.

import { requirePlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from './serve-dir.mjs';
import { coverage, judgeReply, splitReply } from './ask-suggestions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.DIST || path.join(HERE, 'dist'));
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const WIDTH = Number(process.env.WIDTH || 390);

let BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
let server = null;
if (!BASE) {
  if (!fs.existsSync(path.join(DIST, 'ask', 'index.html'))) {
    console.error(`No built /ask/ page at ${DIST}/ask/index.html. Run: node platform/pages/build.mjs`);
    process.exit(2);
  }
  server = await serveDir(DIST);
  BASE = server.base;
}

const playwright = await requirePlaywright();
const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});
const failures = [];
const lines = [];
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 } });
  const page = await context.newPage();
  const open = async () => {
    await page.goto(`${BASE}/ask/`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#ask-app .pa-try button', { timeout: 10000 }).catch(() => null);
  };
  await open();
  const questions = await page.$$eval('#ask-app .pa-try button', (bs) => bs.map((b) => b.textContent.trim()));
  if (!questions.length) {
    console.error(`No example questions (.pa-try buttons) on ${BASE}/ask/.`);
    process.exit(2);
  }
  // A question with no expectation fails in judgeReply below.
  const { stale } = coverage(questions);
  for (const q of stale) lines.push(`note: ask-suggestions.mjs expects "${q}", which /ask/ no longer shows`);

  for (const [i, q] of questions.entries()) {
    if (i) await open(); // a tap removes the row, so each question starts from a fresh page
    const before = await page.$$eval('#ask-app .pa-bot', (m) => m.length);
    await page.locator('#ask-app .pa-try button', { hasText: q }).first().click();
    let reply = null;
    try {
      await page.waitForFunction((n) => document.querySelectorAll('#ask-app .pa-bot').length > n, before, { timeout: 15000 });
      reply = await page.$eval('#ask-app .pa-bot:last-of-type', (m) => ({
        text: m.querySelector(':scope > span')?.textContent || '',
        links: [...m.querySelectorAll('ul a')].map((a) => ({ title: a.textContent.trim(), href: a.getAttribute('href') })),
      }));
      Object.assign(reply, { passage: splitReply(reply.text).passage, dead: [] });
    } catch { /* no reply: judged below */ }
    // Fetch every tool the reply links: a renamed or retired tool the search
    // index still names would otherwise pass as "a link matching /roof/".
    for (const { href } of reply?.links || []) {
      const url = new URL(href, `${BASE}/ask/`);
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!res || !res.ok) reply.dead.push(url.pathname);
    }
    const problems = judgeReply(q, reply);
    const got = reply
      ? [reply.passage && `passage "${reply.passage.slice(0, 70)}${reply.passage.length > 70 ? '…' : ''}"`,
        reply.links.length && `${reply.links.length} link(s): ${reply.links.slice(0, 3).map((l) => l.title).join('; ')}`]
        .filter(Boolean).join(', ') || 'empty'
      : 'no reply';
    lines.push(`${problems.length ? 'FAIL' : 'ok  '} "${q}" -> ${got}`);
    for (const p of problems) failures.push(`"${q}": ${p}`);
  }
  await context.close();
} finally {
  await browser.close();
  server?.srv.close();
}

console.log(lines.join('\n'));
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('Every /ask/ example question gets an answer, and every link in it loads.');
