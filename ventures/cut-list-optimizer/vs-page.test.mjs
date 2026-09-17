import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = read('vs-opticutter-and-cutlist-optimizer.html');
const index = read('index.html');

test('index links to the hosted-optimizer comparison page', () => {
  assert.match(index, /vs-opticutter-and-cutlist-optimizer\.html/);
});

test('the comparison page names both incumbents, disclaims affiliation, and carries the standard disclaimers', () => {
  assert.match(html, /<title>This cut list optimizer vs\. optiCutter and CutList Optimizer/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /opticutter\.com/);
  assert.match(html, /cutlistoptimizer\.com/);
  assert.match(html, /rel="nofollow noopener"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by optiCutter or CutList Optimizer/i);
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

// Both vendors' own sites are blocked by this environment's egress proxy, and
// the third-party round-ups that do publish figures for them contradict each
// other on exactly the numbers a reader would act on -- one attributes "5 stock
// sizes / 20 part sizes / 500 parts" to CutList Optimizer and another
// attributes the identical figures to optiCutter. So the page states no price
// and no tier limit for either and links out instead, the same discipline
// commercial-photo-license-calculator/vs-fotoquote.html follows. This test is
// what keeps a later edit from quietly reintroducing an unverifiable number.
test('no price or free-tier limit is claimed for either hosted service', () => {
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /[€£]\s?\d/);
  assert.doesNotMatch(html, /\d+\s*(calculations?|parts?|panels?|stock sizes?|part sizes?)\s*(a|per)\s*(day|month|week)/i);
  assert.match(html, /No prices or tier limits are quoted for either service/);
});

test('every capability the page claims for this tool is one the tool actually has', async () => {
  const sheet = await import('./sheet.mjs');
  const calc = await import('./calc.mjs');
  // Sheet nesting with kerf, edge trim, grain lock and on-hand offcuts.
  assert.equal(typeof sheet.optimizeSheets, 'function');
  assert.match(html, /saw kerf and edge trim/i);
  assert.match(html, /Grain lock/i);
  assert.match(html, /On-hand offcuts/i);
  // The "sheets avoided" figure the page promises is a real reported field.
  const plan = sheet.optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: sheet.parsePanels('Door: 24 x 30 x 2\nSide: 20 x 40 grain'),
    onHand: [{ width: 96, height: 48 }],
  });
  assert.ok(Object.hasOwn(plan, 'purchasesAvoided'), 'optimizeSheets no longer reports purchasesAvoided');
  // The board-length ranking, and the four lengths the page names.
  assert.equal(typeof calc.compareStockLengths, 'function');
  const labels = calc.COMMON_STOCK_LENGTHS.in.map((entry) => entry.label);
  for (const label of ['8 ft', '10 ft', '12 ft', '16 ft']) {
    assert.ok(labels.includes(label), `${label} is named on the page but no longer offered`);
  }
  // The sibling comparison page the table points at.
  assert.match(html, /href="compare-4x8-vs-5x5\.html"/);
});

test('the page makes no network call, matching every other page on this static site', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('robots and sitemap let crawlers reach the new page', () => {
  assert.match(read('robots.txt'), /Allow: \//);
  assert.match(read('sitemap.xml'), /vs-opticutter-and-cutlist-optimizer\.html/);
});
