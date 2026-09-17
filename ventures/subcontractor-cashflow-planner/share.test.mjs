import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NUMBER_FIELD_IDS, decodeInputs, encodeInputs } from './share.mjs';
import { planCashflow } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Every field the form reads, set to something other than the page's own
// starting default, so a dropped field shows up as a changed plan rather
// than coincidentally matching what the recipient would have seen anyway.
const SENDER = Object.freeze({
  invoice: 24000,
  materials: 6100,
  weeklyBurn: 950,
  terms: 45,
  retention: 5,
  retentionRelease: 90,
  delay: 21,
  startingCash: 3000,
  deposit: 15,
  supplierTerms: 60,
  apr: 18,
});

test('every named form field is a declared number field', () => {
  const names = [...index.matchAll(/<input[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]);
  assert.ok(names.length > 0, 'the form should declare at least one named field');
  for (const name of names) {
    assert.ok(NUMBER_FIELD_IDS.includes(name), `${name} is read by the form but dropped from the share link`);
  }
});

test('a round trip preserves every numeric value', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
});

test('the recipient computes exactly the same scenario the sender saw', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  const sent = planCashflow(SENDER);
  const received = planCashflow(decoded);
  assert.equal(received.gap, sent.gap);
  assert.equal(received.surplus, sent.surplus);
  assert.equal(received.bridgeCost, sent.bridgeCost);
  assert.equal(received.expectedCashDay, sent.expectedCashDay);
  assert.equal(received.absorbableDelay, sent.absorbableDelay);
});

test('blank or missing numeric fields are omitted rather than sent as zero', () => {
  const encoded = encodeInputs({ invoice: 10000, materials: '', weeklyBurn: null });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.invoice, 10000);
  assert.ok(!('materials' in decoded));
  assert.ok(!('weeklyBurn' in decoded));
});

test('a truncated or hostile fragment opens the page instead of breaking it', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs('#'), {});
  assert.deepEqual(decodeInputs('invoice=abc&materials=-5'), {});
  assert.deepEqual(decodeInputs('__proto__=polluted&invoice=10000'), { invoice: 10000 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs('?invoice=10000'), { invoice: 10000 });
});

test('the usage opt-out choice is never carried between devices', () => {
  assert.ok(!NUMBER_FIELD_IDS.includes('usage'));
  assert.ok(!('usage' in decodeInputs('usage=true&invoice=10000')));
});

test('the page offers the link and the inline script reads one back on arrival', () => {
  assert.match(index, /id="shareLink"/);
  assert.match(index, /id="shareStatus"/);
  assert.match(index, /Copy share link/);
  assert.match(index, /import\s*\{[^}]*decodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(index, /location\.hash/);
  assert.match(index, /recordUsage\('shared_scenario_opened'/);
  assert.match(index, /recordUsage\('share_link_copied'/);
});
