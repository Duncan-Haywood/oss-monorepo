import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, DATE_FIELD_IDS } from './share.mjs';

const sample = {
  riskAward: 24000,
  riskSpent: 8500,
  riskInstallment: 6000,
  riskRenewal: 0,
  riskClawback: 0,
  riskDue: '2026-09-15',
  edHours: 14,
  edRate: 42,
  writerHours: 8,
  writerRate: 85,
};

test('every field the risk form reads has a share slot', () => {
  const all = [...NUMBER_FIELD_IDS, ...DATE_FIELD_IDS];
  assert.deepEqual(all.sort(), Object.keys(sample).sort());
});

test('round-trips every field', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('omits a blank or zero-default field rather than sending a value the sender never chose', () => {
  const { riskDue, ...required } = sample;
  const encoded = encodeInputs(required);
  const params = new URLSearchParams(encoded);
  assert.equal(params.has('riskDue'), false);
  assert.deepEqual(decodeInputs(encoded), required);
});

test('rejects a fragment that is not date-shaped', () => {
  const encoded = encodeInputs({ ...sample, riskDue: 'not-a-date' });
  assert.equal(decodeInputs(encoded).riskDue, undefined);
});

test('a date-shaped but calendar-invalid string still passes through, for calc.mjs to reject', () => {
  // Documented, deliberate: the encoder only checks YYYY-MM-DD shape, not
  // that the date exists, so this is the one case where decodeInputs is not
  // the last word -- compareLateReport treats an unparseable due date as
  // "not set" the same way it does one typed by hand.
  assert.equal(decodeInputs('riskDue=2026-13-99').riskDue, '2026-13-99');
});

test('drops unknown fields and negative numbers', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', riskAward: -1, extra: 12 });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('extra' in decoded, false);
  assert.equal('riskAward' in decoded, false);
  assert.equal(decoded.riskInstallment, 6000);
});

test('accepts hash or query prefixes', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
});

test('ignores non-numeric, empty, and missing input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs('riskAward=not-a-number'), {});
  assert.deepEqual(decodeInputs(), {});
});

test('a crafted __proto__ field is dropped rather than polluting the prototype', () => {
  const decoded = decodeInputs('__proto__=nope&riskAward=100');
  assert.equal(decoded.riskAward, 100);
  assert.equal({}.nope, undefined);
});
