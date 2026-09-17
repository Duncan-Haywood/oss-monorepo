import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs } from './share.mjs';

const SAMPLE = {
  ratio: 8, staffCount: 3, roomCapacity: 24, occupancyRate: 90,
  currentTuitionPerChild: 950, hourlyWage: 19.5, hoursPerDay: 9.5,
  daysPerWeek: 5, payrollBurdenPercent: 14, monthlyOverhead: 1800,
  targetMarginPercent: 12,
};

test('FIELD_IDS matches calc.mjs INPUT_FIELDS exactly, so a new arithmetic field is shareable', () => {
  assert.deepEqual(FIELD_IDS, INPUT_FIELDS);
});

test('round-trips every known field', () => {
  const encoded = encodeInputs({ ...SAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], SAMPLE[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?ratio=8'), { ratio: 8 });
  assert.deepEqual(decodeInputs('#ratio=8'), { ratio: 8 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('ratio=abc&staffCount=3'), { staffCount: 3 });
  assert.equal(encodeInputs({ ratio: -5 }).includes('ratio='), false);
});

test('a zero value round-trips rather than being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, monthlyOverhead: 0 });
  assert.equal(decodeInputs(encoded).monthlyOverhead, 0);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});
