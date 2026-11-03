import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EXPERIMENTS, coverSvg, agentPrompt, handoffScript, renderLabIndex, renderHandoffPage, buildLab } from './lab.mjs';

const tool = {
  slug: 'roof-bid-calculator',
  name: 'Roof bid calculator',
  url: 'https://example.test/site/roof-bid-calculator/',
  category: 'Trades',
  description: 'Price a roof job.',
};
const opts = { repoUrl: 'https://github.com/o/r', embedParam: 'pfEmbed', embedHeight: 1400 };

test('covers are deterministic, distinct and self-contained SVG', () => {
  assert.equal(coverSvg('a'), coverSvg('a'));
  assert.notEqual(coverSvg('a'), coverSvg('b'));
  assert.match(coverSvg('a'), /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(coverSvg('a'), /NaN|undefined|href=/);
});

test('covers never change: the same name gives the same picture forever (all three shape kinds)', () => {
  // 'b' draws circles, 'd' rotated rects, 'a' curves. A changed hash constant or
  // shape rule silently repaints every cover on the site, so pin the output.
  const sha = (n) => createHash('sha256').update(coverSvg(n)).digest('hex').slice(0, 12);
  assert.deepEqual(['a', 'b', 'd'].map(sha), ['0c7dd4424330', '64616ea0d5ae', 'b70de4d0d902']);
});

test('the agent prompt names the tool, all three paths, the license and the disclaimer', () => {
  const md = agentPrompt(tool, opts);
  for (const s of [tool.name, tool.url, 'MIT', 'Path A', 'Path B', 'Path C', 'no warranty', 'describe roof-bid-calculator', '?pfEmbed=1', 'min-height:1400px']) {
    assert.ok(md.includes(s), `missing ${s}`);
  }
});

test('functions shipped to the browser as source still run on their own', () => {
  // The page inlines coverSvg/agentPrompt with Function#toString, so they must
  // not close over anything in this module.
  const sandbox = {};
  vm.runInNewContext(`cover=${coverSvg.toString()};prompt=${agentPrompt.toString()};`, sandbox);
  assert.equal(sandbox.cover('x'), coverSvg('x'));
  assert.equal(sandbox.prompt(tool, opts), agentPrompt(tool, opts));
});

test('the handoff script parses', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-'));
  const file = path.join(dir, 'handoff.js');
  await fs.writeFile(file, handoffScript());
  execFileSync(process.execPath, ['--check', file]);
});

test('lab pages are noindex experiments carrying the disclaimer and linking each live experiment', () => {
  for (const html of [renderLabIndex(), renderHandoffPage()]) {
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /no warranty/i);
  }
  const index = renderLabIndex();
  for (const x of EXPERIMENTS.filter((e) => e.status === 'live')) {
    assert.ok(index.includes(`href="${x.href ?? `${x.id}/`}"`), `${x.id} not linked`);
  }
  assert.equal(new Set(EXPERIMENTS.map((x) => x.id)).size, EXPERIMENTS.length);
});

test('buildLab writes the index and the handoff page', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-'));
  await buildLab(dir);
  await fs.access(path.join(dir, 'lab', 'index.html'));
  await fs.access(path.join(dir, 'lab', 'handoff', 'index.html'));
});

// Behavioural test of the browser script. Playwright is not a dependency: the
// test skips when it cannot load (PLAYWRIGHT / CHROME_PATH as in platform/uitest/lib/browser.mjs).
let chromium = null;
try {
  const mod = await import(process.env.PLAYWRIGHT || 'playwright');
  chromium = mod.chromium ?? mod.default?.chromium;
} catch { /* skipped below */ }

const CATALOG = { tools: [
  { slug: 'roof-bid-calculator', name: 'Roof bid calculator', url: 'https://example.test/roof/', category: 'Trades', description: 'Price a roof job.' },
  { slug: 'form-1099-checker', name: '1099 checker', url: 'https://example.test/1099/?x=1', category: 'Tax', description: 'Check a 1099.' },
] };

test('handoff page: search, pick, tabs, keyboard, copy', { skip: !chromium && 'playwright not installed' }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('https://lab.test/lab/handoff/', (r) => r.fulfill({ contentType: 'text/html', body: renderHandoffPage() }));
    await page.route('https://lab.test/catalog.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(CATALOG) }));
    await page.addInitScript(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } }); });
    await page.goto('https://lab.test/lab/handoff/');
    await page.waitForFunction(() => !document.getElementById('q').disabled);
    assert.match(await page.getAttribute('#q', 'placeholder'), /Search 2 tools/);

    await page.fill('#q', 'roof');
    assert.equal(await page.locator('#results button').count(), 1);
    assert.equal(await page.textContent('#status'), '1 match shown');
    await page.fill('#q', 'roof zzz');
    assert.match(await page.textContent('#status'), /No tool matches/);
    await page.fill('#q', '1099 tax');
    assert.equal(await page.locator('#results button').count(), 1, 'every word must match');

    await page.fill('#q', 'roof');
    await page.press('#q', 'Enter');
    assert.equal(await page.textContent('#picked h2'), 'Roof bid calculator');
    assert.equal(await page.evaluate(() => location.hash), '#roof-bid-calculator');
    assert.equal(await page.locator('#picked .art svg').count(), 1);
    assert.ok((await page.innerHTML('#picked .art')).includes(coverSvg('roof-bid-calculator', 192).slice(0, 40)));
    assert.equal(await page.locator('[role=tab]').count(), 5);
    assert.equal(await page.getAttribute('#tab-agent', 'aria-selected'), 'true');
    assert.equal(await page.getAttribute('#tab-embed', 'aria-selected'), 'false');

    // Every tab is switchable and only one is selected at a time.
    for (const [i, id] of ['agent', 'embed', 'cli', 'link', 'json'].entries()) {
      await page.click(`#tab-${id}`);
      const sel = await page.$$eval('[role=tab]', (t) => t.map((b) => b.getAttribute('aria-selected')));
      assert.deepEqual(sel, sel.map((_, k) => String(k === i)), `tab ${id}`);
    }
    // Keyboard: arrows wrap around and move focus.
    await page.focus('#tab-agent');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-json');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-agent');
    assert.equal(await page.getAttribute('#tab-agent', 'aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getAttribute('#tab-embed', 'aria-selected'), 'true');

    // Copy puts the shown text on the clipboard.
    await page.click('.copy');
    const shown = await page.textContent('#panel pre');
    assert.equal(await page.evaluate(() => window.__copied), shown);
    assert.match(shown, /<iframe src="https:\/\/example\.test\/roof\/\?pfEmbed=1"/);

    // An existing query string gets & not ?, and ArrowDown/Up cycle the results.
    await page.fill('#q', '1099');
    await page.press('#q', 'Enter');
    await page.click('#tab-embed');
    assert.match(await page.textContent('#panel pre'), /1099\/\?x=1&pfEmbed=1/);
    await page.fill('#q', 'c');
    const n = await page.locator('#results button').count();
    assert.equal(n, 2);
    await page.press('#q', 'ArrowDown');
    assert.equal(await page.getAttribute('#opt-1', 'aria-selected'), 'true');
    await page.press('#q', 'ArrowUp');
    assert.equal(await page.getAttribute('#opt-0', 'aria-selected'), 'true');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
