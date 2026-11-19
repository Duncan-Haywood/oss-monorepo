import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inertKeys, pageHasControl, checkOne } from './inert_inputs.mjs';

test('inertKeys reports a key nothing reads, not one another key unlocks', async () => {
  // `fee` only counts once `extras` is above zero; `rate` is read under a different name.
  const fn = (o) => ({ total: o.price + o.extras * o.fee, pct: o.ratePct });
  const keys = await inertKeys(fn, { price: 10, extras: 0, fee: 5, rate: 3, ratePct: 2, label: 'x' });
  assert.deepEqual(keys, ['rate']);
});

test('inertKeys is null when the function throws on its defaults', async () => {
  assert.equal(await inertKeys(() => { throw new Error('no'); }, { a: 1 }), null);
});

test('pageHasControl matches an input, select or textarea by id or name', () => {
  assert.ok(pageHasControl('<input type="number" id="rent" value="0">', 'rent'));
  assert.ok(pageHasControl("<select name='base'>", 'base'));
  assert.ok(!pageHasControl('<input id="rentPct">', 'rent'));
});

test('a real tool whose studio fields were once ignored now reads every key', async () => {
  const r = await checkOne('lash-studio-service-profit-calculator');
  assert.deepEqual(r.inert, []);
});
