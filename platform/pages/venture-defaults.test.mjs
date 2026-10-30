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

test('grounds a page that carries its rates in markup', async () => {
  const { result, blank } = await ground('sump-pump-bid-calculator');
  assert.equal(result.totalHours, 2.45);
  assert.ok(result.price > 0 && result.laborCost > 0 && result.materialCost > 0);
  // Only the optional "what if I bid X?" field is meant to start empty.
  assert.deepEqual(blank, ['proposedPrice']);
});

// The regression this module exists for. stair-lift ships its rate fields empty
// and fills them at load from suggested*Kit(); reading markup alone yields
// 0 hours / 0 material / $136.56, which is not a price any visitor is shown.
// If this ever goes back to zero, FAQ copy grounded on it will be fiction.
test('grounds a page that fills its rates from kits at load', async () => {
  const { result, blank } = await ground('stair-lift-bid-calculator');
  assert.ok(result.totalHours > 0, 'kits must supply the hour rates');
  assert.ok(result.materialCost > 0, 'kits must supply the invoice costs');
  assert.ok(result.price > 1000, `expected a real price, got ${result.price}`);
  // proposedPrice is the optional "what if I bid X?" field and is meant to be
  // empty; anything else blank means the page was not faithfully reproduced.
  assert.deepEqual(blank, ['proposedPrice']);
});

// A kit fills a blank field and never overwrites one that already has a value,
// the same rule applyKit() follows on the page.
test('a load-time kit fills blanks but leaves a field with a value alone', () => {
  const html = `<script>const FIELD_IDS = ['hours', 'rate'];
    function readInput() {
      return FIELD_IDS;
    }</script>
    <input id="hours" value="5"><input id="rate" value="">`;
  const { input } = defaultInput(html, { suggestedRailKit: () => ({ hours: '99', rate: '40' }) });
  assert.equal(input.hours, '5');
  assert.equal(input.rate, '40');
});

// The CLI entry guard and exit codes: a caller tells "grounded everything" from
// "needs the browser oracle" by the exit status alone.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./venture-defaults.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('cli with no slug prints usage and exits 2', () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test('cli with an unknown slug reports it and exits 1', () => {
  const r = run('no-such-venture-slug');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no-such-venture-slug/);
});
