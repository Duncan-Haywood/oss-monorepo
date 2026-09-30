import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultFor, ground } from './venture-defaults.mjs';

test('reads a numeric input default out of the markup', () => {
  assert.equal(defaultFor('<input id="jobs" type="number" value="20">', 'jobs'), '20');
});

test('reads a checkbox as a boolean, not a string', () => {
  assert.equal(defaultFor('<input id="a" type="checkbox" checked>', 'a'), true);
  assert.equal(defaultFor('<input id="a" type="checkbox">', 'a'), false);
});

test('an absent control is undefined, not empty string', () => {
  // The caller skips undefined so the calculator sees its own default, which is
  // not the same as handing it '' and having number() reject the field.
  assert.equal(defaultFor('<input id="other" value="1">', 'missing'), undefined);
});

test('a select honours the selected option, else the first', () => {
  const html = '<select id="s"><option value="a"><option value="b" selected></select>';
  assert.equal(defaultFor(html, 's'), 'b');
  assert.equal(defaultFor('<select id="s"><option value="a"><option value="b"></select>', 's'), 'a');
});

test('an empty select falls back to the array its fillSelect call names', () => {
  // The export name is not derivable from the id in general, so the wiring call
  // is the only reliable source.
  const html = '<select id="cell"></select><script>fillSelect(\'cell\', FOAM_TYPES);</script>';
  const calc = { FOAM_TYPES: [{ id: 'open' }, { id: 'closed' }] };
  assert.equal(defaultFor(html, 'cell', calc), 'open');
});

// 'grounds a page that carries its rates in markup' (sump-pump-bid-calculator)
// and 'grounds a page that fills its rates from kits at load'
// (stair-lift-bid-calculator) were removed 2026-09-30: both calculators, and
// every other page `ground()` could reproduce, moved to the public fp-monorepo
// repository, where those tests still run. No venture left here reads its
// first-load input from `*_IDS` lists or load-time kits, so there is no real
// page to ground; the markup-reading rules above are still tested.
