import test from 'node:test';
import assert from 'node:assert/strict';
import { findingsInText, frontDoorSlugs, scan } from './raw-money-format.mjs';

test('finds a currency symbol before an interpolated toFixed', () => {
  const src = [
    'const format = (value) => `$${value.toFixed(2)}`;',
    '  return `${sign}$${Math.abs(value).toFixed(2)}`;',
    'el.textContent = `€${n.toFixed(0)} and £${(a - b).toFixed(2)}`;',
  ].join('\n');
  const hits = findingsInText(src);
  assert.deepEqual(hits.map((h) => h.line), [1, 2, 3, 3]);
  assert.equal(hits[0].text, '$${value.toFixed(2)}');
});

test('leaves separated, non-money and opted-out lines alone', () => {
  const src = [
    'const f = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;',
    'const pct = `${rate.toFixed(1)}%`;',
    'const t = `$${TIER_THRESHOLD}`;',
    'out.push([ "09/01/2026", `$${spend.toFixed(2)}` ]);',
    'const row = `$${x.toFixed(2)}`; // raw-amount-ok: mimics the export',
  ].join('\n');
  assert.deepEqual(findingsInText(src), []);
});

test('front-door tools format money with thousands separators', () => {
  const slugs = frontDoorSlugs();
  assert.ok(slugs.length > 100, 'front-doors.json lists the tools');
  const found = scan(slugs);
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line} ${f.text}`),
    [],
    'use toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) or mark the line raw-amount-ok (platform/pages/raw-money-format.mjs)',
  );
});
