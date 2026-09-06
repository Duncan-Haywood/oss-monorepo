import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FIELD_IDS, decodeInputs, encodeInputs } from './share.mjs';
import { calculateImpact } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const SENDER = Object.freeze({ customers: 240, currentPrice: 32, proposedPrice: 39, monthlyCosts: 1800 });

test('FIELD_IDS matches the page\'s own field list, so nothing is silently dropped', () => {
  const declared = index.match(/const ids=\[([^\]]*)\]/);
  assert.ok(declared, 'index.html should declare the ids array');
  const ids = [...declared[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...FIELD_IDS]);
});

test('a round trip preserves every field', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
});

test('the recipient computes the same churn ceiling the sender saw', () => {
  const sent = calculateImpact(SENDER);
  const received = calculateImpact(decodeInputs(encodeInputs(SENDER)));
  assert.equal(received.maxChurnRate, sent.maxChurnRate);
  assert.equal(received.breakEvenCustomers, sent.breakEvenCustomers);
});

test('dropping a field would change the churn ceiling the recipient sees — every field is load-bearing', () => {
  const full = calculateImpact(SENDER);
  const missingCosts = calculateImpact({ ...SENDER, monthlyCosts: 0 });
  assert.notEqual(full.scenarios[2].contribution, missingCosts.scenarios[2].contribution);
});

test('blank or missing fields are omitted so the recipient keeps the page default', () => {
  const encoded = encodeInputs({ customers: 50, currentPrice: '', proposedPrice: null });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.customers, 50);
  assert.ok(!('currentPrice' in decoded));
  assert.ok(!('proposedPrice' in decoded));
});

test('a truncated or hostile fragment opens the page instead of breaking it', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs('#'), {});
  assert.deepEqual(decodeInputs('customers=abc&currentPrice=-5'), {});
  assert.deepEqual(decodeInputs('__proto__=polluted&customers=50'), { customers: 50 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs('?customers=50'), { customers: 50 });
});

test("the visitor's usage-counting choice is never carried between devices", () => {
  assert.ok(!FIELD_IDS.includes('usageOptOut'));
  assert.ok(!('usageOptOut' in decodeInputs('usageOptOut=true&customers=50')));
});

test('the page offers the link and reads one back on arrival', () => {
  assert.match(index, /import\s*\{[^}]*encodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(index, /id="copyShareLink"/);
  assert.match(index, /location\.hash/);
});
