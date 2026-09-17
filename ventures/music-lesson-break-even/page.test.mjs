import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

test('page wires the pricing form, local draft controls, and submit-only usage', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  for (const id of ['form', 'reset', 'lessonPrice', 'target', 'breakeven', 'errors', 'lever-section', 'lever-body', 'lever-summary']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /localStorage\.setItem\(storageKey/);
  assert.match(page, /form\.addEventListener\('submit'/);
  assert.match(page, /update\(true\)/);
  assert.match(page, /document\.querySelector\('#reset'\)\.addEventListener/);
  assert.match(page, /comparePolicyLevers/);
  assert.match(page, /policy_levers_viewed/);
});

test('an invalid input clears stale results instead of leaving them next to a silent error', async () => {
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // showed the error in #errors but left #target, #breakeven, #revenue,
  // #paid, #hourly, #message, #lever-summary, and the lever table all
  // showing the last valid calculation. A visitor could easily miss the
  // banner and read those stale figures as the answer for what is now on
  // screen.
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /id="errors" class="warning" role="alert"/, 'the error region is not announced');
  const scriptMatch = page.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/catch\(error\)\{([\s\S]*?)\n {4}\}\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  for (const id of ['target', 'breakeven', 'revenue', 'paid', 'hourly', 'message', 'lever-summary']) {
    assert.match(
      body,
      new RegExp(`querySelector\\('#${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /querySelector\('#lever-body'\)\.innerHTML\s*=\s*''/, 'the stale lever table rows are never cleared');
  assert.match(body, /querySelector\('#errors'\)\.hidden\s*=\s*false/, 'the error message is never shown');
});

// Regression: sitemap.xml was missing how-to-price-music-lessons.html, a
// real page linked from index.html, so a crawler following robots.txt ->
// sitemap.xml never discovered it. Same defect class fixed for
// public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest sibling: same break-even shape (fixed ownership/overhead cost
// spread over bookings vs. lesson slots), but music lesson time rather than
// equipment rental bookings. Without a crawlable link here, a crawler
// entering on the music lesson calculator never reaches the equipment rental
// break-even calculator in one hop.
test('index links one hop to the equipment-rental-break-even sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/equipment-rental-break-even\/"/,
    'index must link ../equipment-rental-break-even/ so crawlers reach the equipment rental break-even calculator in one hop',
  );
});

// Closest sibling: same fixed-cost-over-occupancy shape (a room or a lesson
// slot both cost the same whether filled or not), but a classroom of
// enrolled children rather than one teacher's booked lessons. Without a
// crawlable link here, a crawler entering on the music lesson calculator
// never reaches the daycare tuition calculator in one hop -- it was a
// crawlable orphan (siblings.mjs) until this link closed it.
test('index links one hop to the childcare-tuition-calculator sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/childcare-tuition-calculator\/"/,
    'index must link ../childcare-tuition-calculator/ so crawlers reach the daycare tuition calculator in one hop',
  );
});
