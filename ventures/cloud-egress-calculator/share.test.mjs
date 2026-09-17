import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NUMBER_FIELD_IDS, TEXT_FIELD_IDS, decodeInputs, encodeInputs } from './share.mjs';
import { compareScenarios, parseEgressTiers } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Every field the page reads, set to something other than its own starting
// default, so a dropped field shows up as a changed comparison rather than
// coincidentally matching what the recipient's page would have shown anyway.
const SENDER = Object.freeze({
  storage: 800, requests: 3.5, egress: 220,
  aName: 'Acme Object Store', aStorage: 0.021, aRequests: 0.38, aEgress: 0.08, aFree: 10,
  aTiers: '10240 0.09\n40960 0.085\n0.05',
  bName: 'Northwind Cloud', bStorage: 0.007, bRequests: 0.33, bEgress: 0.02, bFree: 5,
  bTiers: '',
});

test('every field the page reads is either a declared number field or a declared text field', () => {
  const declared = index.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(declared, 'index.html should declare ids');
  const ids = [...declared[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'ids should name at least one field');
  for (const id of ids) {
    assert.ok(
      NUMBER_FIELD_IDS.includes(id) || TEXT_FIELD_IDS.includes(id),
      `${id} is read by the page but dropped from the share link`,
    );
  }
  // aName/bName are read separately from `ids` (see the `.concat` call), but
  // the share link still has to carry them or a shared comparison would open
  // with "Option A" / "Option B" instead of the provider names the sender typed.
  assert.match(index, /ids\.concat\(\["aName", "bName"\]\)/);
  assert.ok(TEXT_FIELD_IDS.includes('aName') && TEXT_FIELD_IDS.includes('bName'));
});

test('a round trip preserves every numeric value and every text field, including a multi-line rate sheet', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
  assert.equal(decoded.aName, SENDER.aName);
  assert.equal(decoded.bName, SENDER.bName);
  assert.equal(decoded.aTiers, SENDER.aTiers);
});

test('a blank text field is omitted so the recipient keeps their own default', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  assert.ok(!('bTiers' in decoded), 'an empty rate sheet should not overwrite the recipient default with an empty string');
});

test('the recipient computes the same comparison the sender saw, graduated rates included', () => {
  const load = { storageGb: SENDER.storage, requestsMillion: SENDER.requests, egressGb: SENDER.egress };
  const decoded = decodeInputs(encodeInputs(SENDER));
  const sent = compareScenarios({
    first: { ...load, storageRate: SENDER.aStorage, requestRate: SENDER.aRequests, egressRate: SENDER.aEgress, freeEgressGb: SENDER.aFree, egressTiers: parseEgressTiers(SENDER.aTiers) },
    second: { ...load, storageRate: SENDER.bStorage, requestRate: SENDER.bRequests, egressRate: SENDER.bEgress, freeEgressGb: SENDER.bFree, egressTiers: parseEgressTiers(SENDER.bTiers) },
  });
  const received = compareScenarios({
    first: { ...load, storageRate: decoded.aStorage, requestRate: decoded.aRequests, egressRate: decoded.aEgress, freeEgressGb: decoded.aFree, egressTiers: parseEgressTiers(decoded.aTiers) },
    second: { ...load, storageRate: decoded.bStorage, requestRate: decoded.bRequests, egressRate: decoded.bEgress, freeEgressGb: decoded.bFree, egressTiers: parseEgressTiers(decoded.bTiers ?? '') },
  });
  assert.equal(received.first.total, sent.first.total);
  assert.equal(received.second.total, sent.second.total);
  assert.equal(received.savings, sent.savings);
});

test('blank or missing numeric fields are omitted rather than sent as zero', () => {
  const encoded = encodeInputs({ storage: 500, requests: '', egress: null, aName: 'X' });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.storage, 500);
  assert.ok(!('requests' in decoded));
  assert.ok(!('egress' in decoded));
  assert.equal(decoded.aName, 'X');
});

test('a truncated or hostile fragment opens the page instead of breaking it', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs('#'), {});
  assert.deepEqual(decodeInputs('storage=abc&egress=-5'), {});
  assert.deepEqual(decodeInputs('__proto__=polluted&storage=500'), { storage: 500 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs('?storage=500'), { storage: 500 });
});

test('the visitor\'s usage-counting choice is never carried between devices', () => {
  assert.ok(!NUMBER_FIELD_IDS.includes('usage') && !TEXT_FIELD_IDS.includes('usage'));
  assert.ok(!('usage' in decodeInputs('usage=false&storage=500')));
});

test('the page offers the link and reads one back on arrival', () => {
  assert.match(index, /import\s*\{[^}]*encodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(index, /id="copyShareLink"/);
  assert.match(index, /window\.location\.hash/);
});
