#!/usr/bin/env node
// Drives a real browser through the site's primary customer journey:
// land on the hub, search for a tool, open it, type a number, get money back.
//
// `check.mjs` reads the built files and can prove a page exists, links resolve,
// and the disclaimer is present. It cannot prove the thing a visitor actually
// came for — that the calculator computes. A tool whose `calc.mjs` throws on
// load passes every static check and is still useless in front of a user.
// This is the pass that catches that.
//
//   node platform/pages/journey.mjs --dist=platform/pages/dist
//
// Playwright is not a dependency of this repo. When it is not installed this
// exits 0 with a SKIP line, so it can sit in a pipeline without turning it red;
// run it locally (or wherever a browser is available) before a publish. See
// README.md, "Before the owner flips Pages on".

import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const distDir = path.resolve(arg('dist', path.join(HERE, 'dist')));

// Tools worth driving rather than merely loading: one from each shape of
// calculator on the site, so a regression in a shared helper shows up.
const DRIVE = [
  'ebay-fee-calculator',
  'invoice-payment-terms-calculator',
  'amazon-fba-calculator',
  'janitorial-bid-calculator',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/** Serve `dist` the way Pages does: directory URLs fall through to index.html. */
function serve(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let target = path.join(root, decodeURIComponent(url.pathname));
      if (!path.resolve(target).startsWith(path.resolve(root))) {
        res.writeHead(403).end();
        return;
      }
      const stat = await fs.stat(target).catch(() => null);
      if (stat?.isDirectory()) target = path.join(target, 'index.html');
      const body = await fs.readFile(target);
      res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function loadPlaywright() {
  for (const specifier of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return await import(specifier);
    } catch {
      /* try the next location */
    }
  }
  return null;
}

const playwright = await loadPlaywright();
if (!playwright) {
  console.log('SKIP journey — playwright is not installed here. Static checks (check.mjs) still apply.');
  process.exit(0);
}

if (!(await fs.stat(distDir).catch(() => null))) {
  console.error(`No built site at ${distDir} — run build.mjs first.`);
  process.exit(1);
}

const { server, port } = await serve(distDir);
const base = `http://127.0.0.1:${port}`;
const browser = await playwright.chromium.launch();
const failures = [];
const note = (line) => console.log(line);

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Anything the browser itself complains about is a real defect: a module
  // that failed to parse, a fetch for a file that was not published.
  const noise = [];
  page.on('pageerror', (e) => noise.push(`pageerror ${page.url()}: ${e.message}`));
  page.on('requestfailed', (r) => noise.push(`requestfailed ${r.url()}`));
  page.on('console', (m) => {
    if (m.type() === 'error') noise.push(`console ${page.url()}: ${m.text()}`);
  });

  // --- 1. the hub -----------------------------------------------------------
  await page.goto(`${base}/`, { waitUntil: 'load' });
  const tools = await page.locator('[data-tool]').count();
  note(`hub: ${tools} tool links`);
  if (tools < 20) failures.push(`hub lists only ${tools} tools`);

  // --- 2. search narrows it ------------------------------------------------
  const search = page.locator('input[type="search"], input[type="text"]').first();
  if (await search.count()) {
    await search.fill('ebay');
    await page.waitForTimeout(250);
    const visible = await page.locator('[data-tool]:visible').count();
    note(`hub search "ebay": ${visible} of ${tools} shown`);
    if (visible === 0) failures.push('hub search matched nothing for "ebay"');
    if (visible === tools) failures.push('hub search did not narrow the list');
  } else {
    failures.push('hub has no search input');
  }

  // --- 3. each tool computes ----------------------------------------------
  for (const slug of DRIVE) {
    const before = noise.length;
    await page.goto(`${base}/${slug}/`, { waitUntil: 'load' });

    const numbers = page.locator('input[type="number"]');
    const count = await numbers.count();

    // Every tool here ships with worked-example defaults, so it already shows
    // figures on load — which means "a dollar sign is on the page" proves
    // nothing about the arithmetic. Change an input and require the output to
    // move: that is the difference between a page that rendered and a
    // calculator that works.
    const readout = async () => (await page.locator('body').innerText()).match(/\$\s?-?[\d,]+(\.\d+)?/g)?.join('|') ?? '';

    const onLoad = await readout();
    let driven = false;
    for (let i = 0; i < Math.min(count, 12) && !driven; i++) {
      const field = numbers.nth(i);
      if (!(await field.isVisible()) || !(await field.isEditable())) continue;
      const current = Number((await field.inputValue()) || '0');
      await field.fill(String(current + 137));
      await field.dispatchEvent('input');
      await page.waitForTimeout(250);
      if ((await readout()) !== onLoad) driven = true;
    }

    const body = await page.locator('body').innerText();
    const money = /\$\s?-?[\d,]+(\.\d+)?/.test(body);
    const disclaimer = /no warranty/i.test(body);
    note(`${slug}: inputs=${count} money=${money} recomputed=${driven} disclaimer=${disclaimer}`);

    if (count === 0) failures.push(`${slug} presented no numeric inputs`);
    if (!money) failures.push(`${slug} showed no currency figure`);
    if (!driven) failures.push(`${slug} did not change its output when an input changed`);
    if (!disclaimer) failures.push(`${slug} rendered no disclaimer`);
    if (noise.length > before) failures.push(`${slug} raised: ${noise.slice(before).join('; ')}`);
  }

  // --- 4. the 404 is the site's, not GitHub's -----------------------------
  const missing = await page.goto(`${base}/no-such-tool/`, { waitUntil: 'load' });
  note(`missing path: HTTP ${missing?.status()}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\nJourney FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nJourney OK — hub, search, and every driven calculator worked.');
