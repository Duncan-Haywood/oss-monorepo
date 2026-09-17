import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NUMBER_FIELD_IDS, TEXT_FIELD_IDS, decodeInputs, encodeInputs } from './share.mjs';
import { parseInputs, plan } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');

// Every field the form reads, set to something other than the page's own
// starting default, so a dropped field shows up as a changed plan rather
// than coincidentally matching what the recipient would have seen anyway.
const SENDER = Object.freeze({
  currency: 'GBP',
  price: 220,
  depositPercent: 40,
  bookingsPerWeek: 18,
  bookingRate: 85,
  noShowWithout: 22,
  noShowWith: 6,
  noticeHours: 72,
  businessName: 'Northside Studio',
  serviceName: 'balayage appointment',
});

test('every named form field is either a declared number field or a declared text field', () => {
  const names = [...index.matchAll(/<(?:input|select)[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]);
  assert.ok(names.length > 0, 'the form should declare at least one named field');
  for (const name of names) {
    assert.ok(
      NUMBER_FIELD_IDS.includes(name) || TEXT_FIELD_IDS.includes(name),
      `${name} is read by the form but dropped from the share link`,
    );
  }
});

test('a round trip preserves every numeric value and every text field', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
  for (const id of TEXT_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
});

test('a blank text field is omitted so the recipient keeps their own default', () => {
  const decoded = decodeInputs(encodeInputs({ ...SENDER, businessName: '' }));
  assert.ok(!('businessName' in decoded), 'an empty business name should not overwrite the recipient default with an empty string');
});

test('the recipient computes exactly the same plan the sender saw', () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  const sent = plan(parseInputs(SENDER).values);
  const received = plan(parseInputs(decoded).values);
  assert.equal(received.deposit, sent.deposit);
  assert.equal(received.balance, sent.balance);
  assert.equal(received.annual, sent.annual);
  assert.equal(received.netChange, sent.netChange);
  assert.equal(received.breakEvenBookingRate, sent.breakEvenBookingRate);
});

test('blank or missing numeric fields are omitted rather than sent as zero', () => {
  const encoded = encodeInputs({ price: 150, depositPercent: '', bookingsPerWeek: null, businessName: 'X' });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.price, 150);
  assert.ok(!('depositPercent' in decoded));
  assert.ok(!('bookingsPerWeek' in decoded));
  assert.equal(decoded.businessName, 'X');
});

test('a truncated or hostile fragment opens the page instead of breaking it', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs('#'), {});
  assert.deepEqual(decodeInputs('price=abc&depositPercent=-5'), {});
  assert.deepEqual(decodeInputs('__proto__=polluted&price=150'), { price: 150 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs('?price=150'), { price: 150 });
});

test('the usage opt-out choice is never carried between devices', () => {
  assert.ok(!NUMBER_FIELD_IDS.includes('optout') && !TEXT_FIELD_IDS.includes('optout'));
  assert.ok(!('optout' in decodeInputs('optout=true&price=150')));
});

test('the page offers the link and app.mjs reads one back on arrival', () => {
  assert.match(index, /id="share-link"/);
  assert.match(index, /id="share-status"/);
  assert.match(appSource, /import\s*\{[^}]*decodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(appSource, /window\.location\.hash/);
  assert.match(appSource, /recordUsage\('shared_link_opened'\)/);
  assert.match(appSource, /recordUsage\('share_link_copied'\)/);
});
