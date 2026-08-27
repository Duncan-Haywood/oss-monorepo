import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('page carries the no-warranty clause and a local-only privacy line', () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, or financial advice/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /never which repo you scanned/i);
});

test('page wires scoring, usage, and app scripts', () => {
  assert.match(page, /id="scan-form"/);
  assert.match(page, /src="scoring\.js"/);
  assert.match(page, /src="usage\.js"/);
  assert.match(page, /src="app\.js"/);
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(app, /recordUsage/);
  assert.match(app, /scan_completed/);
  assert.match(app, /summary_copied/);
  assert.match(app, /formatScoreSummary/);
});

test('page does not recommend turning Sponsors on', () => {
  assert.match(page, /never tells you/);
  assert.doesNotMatch(page, /you should |must enable /i);
});
