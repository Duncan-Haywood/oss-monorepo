import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Payment Reconciliation Workbench/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /src\/app\.mjs/);
  assert.match(html, /Download review CSV/);
  assert.match(html, /Files are never uploaded/);
});

test('the results panel wires every element app.mjs writes into', () => {
  // app.mjs reaches for these by id; a renamed or dropped element makes the
  // review queue silently stop updating, which no unit test would catch.
  for (const id of ['matched', 'unmatchedPayouts', 'unmatchedDeposits', 'explained', 'table', 'results', 'download', 'message', 'tolerance', 'usage']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.match(html, /What to check/);
});
