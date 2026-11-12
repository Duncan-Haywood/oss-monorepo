import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, UNGROUPED_COUNT } from './count.mjs';

test('formatCount groups thousands the en-US way', () => {
  assert.equal(formatCount(9), '9');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1073), '1,073');
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount(0), '0');
});

test('formatCount passes a placeholder through instead of printing NaN', () => {
  assert.equal(formatCount('—'), '—');
  assert.equal(formatCount(null), '');
  assert.equal(formatCount(undefined), '');
});

test('UNGROUPED_COUNT finds the counts the site writes, not years or form numbers', () => {
  const found = (s) => (s.match(UNGROUPED_COUNT) || []).map((m) => m.trim());
  assert.deepEqual(found('Search 1338 tools and 1073 research projects'), ['1338 tools', '1073 research projects']);
  assert.deepEqual(found('All 3591'), ['All 3591']);
  assert.deepEqual(found('1392 sessions this week'), ['1392 sessions']);
  assert.deepEqual(found('Search 1,338 tools and 1,073 research projects'), []);
  assert.deepEqual(found('the 2026 calculator'), []);
  assert.deepEqual(found('Form 1099 contractor, Form 8949 rows, $5000 tools'), []);
});

test('ungroupedCounts reads visible text, title and description, not scripts', async () => {
  const { ungroupedCounts } = await import('./count.mjs');
  const html = `<title>All 1338 tools | Site</title><meta name="description" content="1073 research projects">
<body><p>Search 1,338 tools</p><script>var x = "9999 tools";</script><!-- 4444 posts --><span>All<span>3591</span></span></body>`;
  assert.deepEqual(ungroupedCounts(html), ['All 1338', '1073 research projects', 'All 3591']);
});
