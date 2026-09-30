import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultFor, defaultInput, ground } from './venture-defaults.mjs';

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

// The two grounding tests below read real bid calculators off disk
// (`sump-pump-bid-calculator` and `stair-lift-bid-calculator`) until both moved
// to the separate open-source repo on 2026-09-30. No page left here fills its
// rates from a kit, and none reproduces a non-zero first-load price through
// `ground()`, so each shape is now a synthetic page with the same wiring:
// a `readInput()` naming its `*_IDS` lists, and a calc module whose
// `suggested*Kit()` fills the rates the markup ships empty.
const fixturePage = (inputs, extra = '') => `<!doctype html><body>
${inputs}
<select id="rail"><option value="straight" selected>Straight</option></select>
<script type="module">
    const FIELD_IDS = ['hours', 'hourlyRate', 'material', 'proposedPrice'];
    const SELECT_IDS = ['rail'];
    function readInput() {
      return Object.fromEntries([...FIELD_IDS, ...SELECT_IDS].map((id) => [id, el(id).value]));
    }
${extra}
</script></body>`;

const priceOf = (input) => {
  const laborCost = Number(input.hours) * Number(input.hourlyRate);
  const materialCost = Number(input.material);
  return { totalHours: Number(input.hours), laborCost, materialCost, price: (laborCost + materialCost) * 1.25 };
};

test('grounds a page that carries its rates in markup', () => {
  const html = fixturePage(
    '<input id="hours" value="2.45"><input id="hourlyRate" value="60">' +
      '<input id="material" value="180"><input id="proposedPrice" value="">',
  );
  const { input, blank } = defaultInput(html, {});
  const result = priceOf(input);
  assert.equal(result.totalHours, 2.45);
  assert.ok(result.price > 0 && result.laborCost > 0 && result.materialCost > 0);
  // Only the optional "what if I bid X?" field is meant to start empty.
  assert.deepEqual(blank, ['proposedPrice']);
});

// The regression this module exists for. stair-lift shipped its rate fields
// empty and filled them at load from suggested*Kit(); reading markup alone
// yielded 0 hours / 0 material / $136.56, which is not a price any visitor is
// shown. If this ever goes back to zero, FAQ copy grounded on it will be fiction.
test('grounds a page that fills its rates from kits at load', () => {
  const html = fixturePage(
    '<input id="hours" value=""><input id="hourlyRate" value="60">' +
      '<input id="material" value=""><input id="proposedPrice" value="">',
  );
  const calc = {
    suggestedRailKit: (rail) => (rail === 'straight' ? { hours: 6, material: 3200 } : {}),
  };
  const { input, blank } = defaultInput(html, calc);
  const result = priceOf(input);
  assert.ok(result.totalHours > 0, 'kits must supply the hour rates');
  assert.ok(result.materialCost > 0, 'kits must supply the invoice costs');
  assert.ok(result.price > 1000, `expected a real price, got ${result.price}`);
  // proposedPrice is the optional "what if I bid X?" field and is meant to be
  // empty; anything else blank means the page was not faithfully reproduced.
  assert.deepEqual(blank, ['proposedPrice']);

  // And without the kit the same markup grounds to the fiction this guards.
  assert.equal(priceOf(defaultInput(html, {}).input).totalHours, 0);
});

test('ground reads a real venture off disk and runs its calculate* entry', async () => {
  const { entry, input, result } = await ground('notary-trip-quote');
  assert.equal(entry, 'calculateQuote');
  assert.ok(Object.keys(input).length > 0, 'the page named no input ids');
  assert.equal(typeof result, 'object');
});
