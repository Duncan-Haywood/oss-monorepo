// The phone probe's rules (phone-probe.mjs; browser half phone-probe-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PHONE, MIN_FIELD_PX, EXAMPLE_RE, SUBMIT_RE, SCROLL_OK_ATTR, PRODUCT_PAGES,
  phoneFailures, probeSlugs, probeRow,
} from './phone-probe.mjs';

const clean = { viewport: 390, height: 844, scrollWidth: 390, swipes: [], smallFields: [{ el: 'input#a', px: 16 }], tallRows: [{ el: 'table', px: 300 }] };

test('a clean page has no failures', () => {
  assert.deepEqual(phoneFailures(clean, { page: 'x/' }), []);
});

test('the 2026-11-26 retainage reading fails: page 581 px wide in a 390 px window', () => {
  const out = phoneFailures({ ...clean, scrollWidth: 581 }, { page: 'retainage-cashflow-calculator/' });
  assert.equal(out.length, 1);
  assert.match(out[0], /retainage-cashflow-calculator\/ at 390px at load: the page scrolls sideways \(581px wide/);
  assert.deepEqual(phoneFailures({ ...clean, scrollWidth: 391 }, { page: 'x/' }), [], 'one px of rounding is slack');
});

test('a table hiding columns in its scroller fails even though the page does not scroll', () => {
  const m = { ...clean, swipes: [{ el: '#fee div.scroll', content: 612, box: 312 }] };
  const out = phoneFailures(m, { page: 'pay-app-guides/pay-application-software-compared.html', state: 'with the example worked out' });
  assert.equal(out.length, 1);
  assert.match(out[0], /with the example worked out: #fee div\.scroll needs a sideways swipe \(612px of content in a 312px box\)/);
  assert.ok(out[0].includes(SCROLL_OK_ATTR), 'names the opt-out');
});

test('fields under 16 px are one failure listing the sizes', () => {
  const m = { ...clean, smallFields: [{ el: 'input#a', px: 15 }, { el: 'textarea#b', px: 13 }, { el: 'select#c', px: 16 }, { el: 'input#d', px: 15 }] };
  const out = phoneFailures(m, { page: 'p/' });
  assert.equal(out.length, 1);
  assert.match(out[0], /3 form field\(s\) under 16px \(13, 15 px; iOS zooms on focus\), first input#a/);
  assert.equal(MIN_FIELD_PX, 16);
});

test('a stacked row taller than the screen fails, naming the worst', () => {
  const m = { ...clean, tallRows: [{ el: 'table#a', px: 900 }, { el: 'table#b', px: 1200 }, { el: 'table#c', px: 844 }] };
  const out = phoneFailures(m, { page: 'p/' });
  assert.equal(out.length, 1);
  assert.match(out[0], /2 stacked table row\(s\) taller than the 844px screen \(worst 1200px in table#b\)/);
});

test('slugs: one industry plus the product pages, deduplicated and sorted; "all" takes every door', () => {
  const doors = { tools: { b: 'construction', a: 'construction', c: 'online-sellers' } };
  assert.deepEqual(probeSlugs(doors, { industry: 'construction', extra: ['z', 'a'] }), ['a', 'b', 'z']);
  assert.deepEqual(probeSlugs(doors, { industry: 'all' }), ['a', 'b', 'c']);
  assert.ok(PRODUCT_PAGES.construction.includes('pay-app-guides'));
});

test('the example and submit patterns match the bet front doors\' buttons, not their neighbours', () => {
  for (const t of ['Load the example', 'Try an example', 'Use sample data', 'Fill in the example', 'Example']) assert.match(t, EXAMPLE_RE, t);
  for (const t of ['Copy the summary', 'Download CSV', 'Clear', 'Remember my entries']) assert.doesNotMatch(t, EXAMPLE_RE, t);
  for (const t of ['Calculate', 'Work it out', 'Check the waiver', 'Generate pay app']) assert.match(t, SUBMIT_RE, t);
  for (const t of ['Copy the summary', 'Download CSV', 'Turn off usage counting']) assert.doesNotMatch(t, SUBMIT_RE, t);
});

test('a row for --all carries the numbers a before/after table needs', () => {
  const r = probeRow({ ...clean, swipes: [{}] }, { page: 'x/', state: 'load' });
  assert.match(r, /width  390  swipes 1  small fields 0\/1  tall rows 0/);
  assert.equal(PHONE.width, 390);
});
