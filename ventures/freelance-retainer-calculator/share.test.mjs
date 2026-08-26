import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareUrl, decodeInputs, encodeInputs, FIELD_IDS, NUMBER_FIELD_IDS } from './share.mjs';

const full = {
  income: 6000,
  costs: 1800,
  hours: 160,
  utilization: 65,
  retainerHours: 20,
  buffer: 15,
  otherRevenue: 3000,
  otherHours: 40,
  fillRate: 60,
  offeredPrice: 1500,
  currency: 'EUR',
  paymentTerms: 'arrears30',
};

test('round-trips a full set of inputs unchanged', () => {
  assert.deepEqual(decodeInputs(encodeInputs(full)), full);
});

test('emits fields in a stable order so the same inputs give the same link', () => {
  const a = encodeInputs({ buffer: 15, income: 6000, currency: 'USD' });
  const b = encodeInputs({ currency: 'USD', income: 6000, buffer: 15 });
  assert.equal(a, b);
  assert.equal(a, 'income=6000&buffer=15&currency=USD');
});

test('accepts numeric strings from form fields', () => {
  assert.deepEqual(
    decodeInputs(encodeInputs({ income: '6000', utilization: '65', currency: 'gbp' })),
    { income: 6000, utilization: 65, currency: 'GBP' },
  );
});

test('drops blank, negative, and non-numeric values instead of encoding them', () => {
  assert.equal(
    encodeInputs({ income: 6000, costs: '', hours: -1, utilization: 'nope', currency: 'XYZ' }),
    'income=6000',
  );
});

test('ignores unknown keys so a link can only ever set known fields', () => {
  assert.equal(encodeInputs({ income: 6000, evil: 999, __proto__: 1 }), 'income=6000');
  assert.deepEqual(decodeInputs('income=6000&evil=999&script=alert(1)'), { income: 6000 });
});

test('tolerates a leading ? or # so location.hash/search can be passed directly', () => {
  assert.deepEqual(decodeInputs('#income=6000&currency=CAD'), { income: 6000, currency: 'CAD' });
  assert.deepEqual(decodeInputs('?income=6000'), { income: 6000 });
});

test('returns an empty object for missing or malformed input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
});

test('builds a hash URL that decodeInputs can restore', () => {
  const url = buildShareUrl('https://example.test/retainer/?utm=1#old', full);
  assert.equal(url.startsWith('https://example.test/retainer/#'), true);
  assert.deepEqual(decodeInputs(url.slice(url.indexOf('#'))), full);
});

test('every encodable field is a real calculator field', () => {
  assert.equal(new Set(FIELD_IDS).size, FIELD_IDS.length);
  assert.ok(NUMBER_FIELD_IDS.includes('retainerHours'));
  assert.ok(NUMBER_FIELD_IDS.includes('otherRevenue'));
  assert.ok(NUMBER_FIELD_IDS.includes('otherHours'));
  assert.ok(NUMBER_FIELD_IDS.includes('fillRate'));
  assert.ok(NUMBER_FIELD_IDS.includes('offeredPrice'));
  assert.ok(FIELD_IDS.includes('currency'));
  assert.ok(FIELD_IDS.includes('paymentTerms'));
});

test('later income-goal, offer, and payment-term fields survive a round trip', () => {
  const encoded = encodeInputs({
    otherRevenue: '3000',
    otherHours: '40',
    fillRate: '60',
    offeredPrice: '1500',
    paymentTerms: 'net15',
    currency: 'usd',
  });
  assert.match(encoded, /otherRevenue=3000/);
  assert.match(encoded, /otherHours=40/);
  assert.match(encoded, /fillRate=60/);
  assert.match(encoded, /offeredPrice=1500/);
  assert.match(encoded, /paymentTerms=net15/);
  assert.deepEqual(decodeInputs(encoded), {
    otherRevenue: 3000,
    otherHours: 40,
    fillRate: 60,
    offeredPrice: 1500,
    currency: 'USD',
    paymentTerms: 'net15',
  });
});

test('drops unknown payment terms the way it drops unknown currencies', () => {
  assert.equal(encodeInputs({ income: 6000, paymentTerms: 'whenever' }), 'income=6000');
  assert.deepEqual(decodeInputs('income=6000&paymentTerms=whenever'), { income: 6000 });
});
