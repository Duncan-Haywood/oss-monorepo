import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default field and reproduces the same price', () => {
  const encoded = encodeInputs({ ...DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of FIELD_IDS) {
    assert.equal(decoded[field], DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
  assert.equal(calculate(decoded).finalPrice, calculate(DEFAULTS).finalPrice);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?dogCount=2'), { dogCount: 2 });
  assert.deepEqual(decodeInputs('#dogCount=2'), { dogCount: 2 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('dogCount=abc&boardingNights=4'), { boardingNights: 4 });
  assert.equal(encodeInputs({ dogCount: -5 }).includes('dogCount='), false);
});

test('a daycare-only booking (zero boarding nights) still round-trips a legitimate zero', () => {
  const daycareOnly = { ...DEFAULTS, boardingNights: 0, daycareDays: 2 };
  const decoded = decodeInputs(encodeInputs(daycareOnly));
  assert.equal(decoded.boardingNights, 0);
  assert.equal(decoded.daycareDays, 2);
});

test('the facility-wide occupancy settings round-trip too, not just the reservation fields', () => {
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  assert.equal(decoded.kennelRuns, DEFAULTS.kennelRuns);
  assert.equal(decoded.fixedMonthlyCosts, DEFAULTS.fixedMonthlyCosts);
  assert.equal(decoded.averageDailyRate, DEFAULTS.averageDailyRate);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ dogCount: '', boardingNights: undefined, daycareDays: 2 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.dogCount, undefined);
  assert.equal(decoded.boardingNights, undefined);
  assert.equal(decoded.daycareDays, 2);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ dogCount: 2 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // overheadPerDogDay must not leave the recipient's own saved draft value
  // in that box -- see check_shared_link_clears.py and the index.html
  // restore.
  const { overheadPerDogDay, ...withoutOverhead } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutOverhead));
  const values = formValues(decoded);
  assert.equal(values.overheadPerDogDay, '');
  assert.equal(values.dogCount, String(DEFAULTS.dogCount));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
