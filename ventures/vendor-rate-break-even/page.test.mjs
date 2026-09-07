import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

test('hosted surface carries the no-SLA sentence the playbook requires', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('scenario names are escaped before they are written into the page', () => {
  assert.match(html, /escapeHtml/);
  assert.match(html, /scenarios\[i\]/);
});

test('a saved draft is read back on load, not just written on save', () => {
  // Regression for the bug change-order-margin-calculator hit in #2209: a
  // "Save draft" button that writes to localStorage but is never read back
  // on load leaves a returning visitor at the hardcoded defaults instead of
  // their own comparison, even though the FAQ promises otherwise.
  assert.match(html, /function restoreDraft\(\)/);
  assert.match(html, /localStorage\.getItem\('vendor-rate-break-even-draft'\)/);
  assert.match(html, /restoreDraft\(\);/);
});

test('a share link takes priority over a locally saved draft', () => {
  assert.match(html, /decodeShare\(location\.hash\)/);
  assert.match(html, /if \(shared\) applyValues\(shared\);\s*\n\s*else restoreDraft\(\);/);
});

test('the share button and status region exist and are wired to the share module', () => {
  assert.match(html, /id="copyShare"/);
  assert.match(html, /id="shareStatus"/);
  assert.match(html, /from '.\/share\.mjs'/);
});

test('the results table shows profit and margin, not just cost, using the revenue field it already collects', () => {
  // Regression: "Revenue per job" was collected, validated, persisted, and
  // shared but never used to compute anything -- the table only ever showed
  // cost-side figures. See calc.test.mjs for the arithmetic coverage.
  assert.match(html, /<th>Profit \/ job<\/th><th>Margin<\/th>/);
  assert.match(html, /row\.profitPerJob/);
  assert.match(html, /row\.marginPercent/);
});

// Closest break-even sibling: same fixed-vs-variable cost shape, but pricing
// rental bookings rather than ranking supplier rates. Related-tool chrome
// rotates inside the subcategory, so without an explicit one-hop a crawler
// on this page may never land on that tool.
test('index links one hop to the equipment-rental-break-even sibling', () => {
  assert.match(
    html,
    /href="\.\.\/equipment-rental-break-even\/"/,
    'index must link ../equipment-rental-break-even/ so crawlers reach the rental calculator in one hop',
  );
  assert.match(html, /equipment rental break-even calculator/i);
});
