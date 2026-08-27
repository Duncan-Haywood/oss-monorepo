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
