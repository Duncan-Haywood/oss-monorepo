import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHOP_RATES_KEY,
  CARRIED_FIELDS,
  normalizeCarry,
  mergedRatesPayload,
  saveCarriedRates,
  readCarriedRates,
} from './shop-rates.mjs';
import { CARRY_LIMITS } from './calc.mjs';

/**
 * The consuming half of the contract, read as text.
 *
 * `platform/pages/rates.mjs` is a build-time module and this one is fetched by a
 * browser from the published venture directory, so neither can import the other
 * at the point where it matters. Reading the source is what keeps the copy from
 * drifting: if somebody renames the key or a field there, these tests fail here,
 * which is the only place that would otherwise find out in production — as a
 * "saved" set of rates that silently never appears on any calculator.
 */
const platformRates = readFileSync(
  new URL('../../platform/pages/rates.mjs', import.meta.url),
  'utf8',
);

test('the storage key matches the one every bid calculator reads', () => {
  const declared = /export const SHOP_RATES_KEY = '([^']+)'/.exec(platformRates);
  assert.ok(declared, 'SHOP_RATES_KEY not found in platform/pages/rates.mjs; the contract changed shape');
  assert.equal(SHOP_RATES_KEY, declared[1]);
});

test('the four field ids and their ceilings match the platform spec', () => {
  const spec = /export const SHOP_RATE_FIELDS = \[([\s\S]*?)\n\];/.exec(platformRates);
  assert.ok(spec, 'SHOP_RATE_FIELDS not found in platform/pages/rates.mjs; the contract changed shape');
  const platformFields = [...spec[1].matchAll(/\{\s*id: '([^']+)'[^}]*?max:\s*([\d.]+)/g)]
    .map(m => ({ id: m[1], max: Number(m[2]) }));
  assert.equal(platformFields.length, 4, 'expected exactly the four carried fields');
  assert.deepEqual(CARRIED_FIELDS.map(f => ({ id: f.id, max: f.max })), platformFields);
});

test('the calculator refuses exactly the rates the platform would drop', () => {
  const byId = Object.fromEntries(CARRIED_FIELDS.map(f => [f.id, f.max]));
  assert.equal(CARRY_LIMITS.burdenRate, byId.burdenRate);
  assert.equal(CARRY_LIMITS.overheadRate, byId.overheadRate);
  assert.equal(CARRY_LIMITS.targetMargin, byId.targetMargin);
});

test('the payload is the shape the bar parses: versioned, under `rates`', () => {
  const payload = mergedRatesPayload(null, { hourlyWage: 28, burdenRate: 92, overheadRate: 21.3, targetMargin: 12 });
  assert.deepEqual(JSON.parse(payload), {
    v: 1,
    rates: { hourlyWage: 28, burdenRate: 92, overheadRate: 21.3, targetMargin: 12 },
  });
});

test('writing merges, so a rate saved on another tool is not wiped', () => {
  // The bar on a partial page can have saved a field this page never writes.
  // Replacing the object wholesale would return that tool to a stranger's
  // ballpark the next time it opened.
  const existing = JSON.stringify({ v: 1, rates: { hourlyWage: 31, operatorWage: 24 } });
  const payload = mergedRatesPayload(existing, { hourlyWage: 28, burdenRate: 92 });
  assert.deepEqual(JSON.parse(payload).rates, { hourlyWage: 28, operatorWage: 24, burdenRate: 92 });
});

test('a rate above the ceiling is dropped rather than stored unusably', () => {
  const payload = mergedRatesPayload(null, { hourlyWage: 28, burdenRate: 900, targetMargin: 12 });
  assert.deepEqual(JSON.parse(payload).rates, { hourlyWage: 28, targetMargin: 12 });
});

test('nothing usable means nothing written, not an empty set written', () => {
  assert.equal(mergedRatesPayload(null, { burdenRate: 900 }), null);
  assert.equal(normalizeCarry({}), null);
  assert.equal(normalizeCarry(null), null);
  assert.equal(normalizeCarry('28'), null);
});

test('a blank or negative value never becomes a zero rate', () => {
  assert.deepEqual(normalizeCarry({ hourlyWage: '', burdenRate: -4, overheadRate: 21 }), { overheadRate: 21 });
});

test('a numeric string from a form field is accepted', () => {
  assert.deepEqual(normalizeCarry({ hourlyWage: ' 28.5 ', targetMargin: '12' }), { hourlyWage: 28.5, targetMargin: 12 });
});

/** The smallest thing that behaves like `localStorage`, including its failures. */
function fakeStorage(initial = null, { throwOnSet = false, throwOnGet = false } = {}) {
  let value = initial;
  return {
    getItem() {
      if (throwOnGet) throw new Error('denied');
      return value;
    },
    setItem(_key, next) {
      if (throwOnSet) throw new Error('quota');
      value = next;
    },
    read: () => value,
  };
}

test('saving reports true only when the rates are really stored', () => {
  const store = fakeStorage();
  assert.equal(saveCarriedRates({ hourlyWage: 28, burdenRate: 92, overheadRate: 21, targetMargin: 12 }, store), true);
  assert.deepEqual(JSON.parse(store.read()).rates.burdenRate, 92);
});

test('a browser that refuses site data gets a false, not an exception', () => {
  // Private mode and "block all cookies" both throw here. A page that threw
  // would stop calculating; a button that reported success it did not have
  // would be worse than one that admits it cannot save.
  assert.equal(saveCarriedRates({ hourlyWage: 28 }, fakeStorage(null, { throwOnSet: true })), false);
  assert.equal(saveCarriedRates({ hourlyWage: 28 }, fakeStorage(null, { throwOnGet: true })), false);
  assert.equal(saveCarriedRates({ hourlyWage: 28 }, null), false);
});

test('unreadable storage is treated as absent rather than thrown', () => {
  const payload = mergedRatesPayload('{not json', { hourlyWage: 28 });
  assert.deepEqual(JSON.parse(payload).rates, { hourlyWage: 28 });
});

test('a bare rates object left by an older version is still read', () => {
  // The bar accepts both `{v,rates}` and a bare map; so must this, or a
  // contractor's existing rates would look absent on this page alone.
  assert.deepEqual(readCarriedRates(fakeStorage(JSON.stringify({ hourlyWage: 31 }))), { hourlyWage: 31 });
  assert.deepEqual(readCarriedRates(fakeStorage(JSON.stringify({ v: 1, rates: { hourlyWage: 31 } }))), { hourlyWage: 31 });
});

test('reading garbage gives no rates rather than an exception', () => {
  assert.equal(readCarriedRates(fakeStorage('')), null);
  assert.equal(readCarriedRates(fakeStorage('{oops')), null);
  assert.equal(readCarriedRates(fakeStorage(JSON.stringify([1, 2]))), null);
  assert.equal(readCarriedRates(fakeStorage(null, { throwOnGet: true })), null);
  assert.equal(readCarriedRates(null), null);
});
