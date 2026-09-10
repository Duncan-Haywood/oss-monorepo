import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculatePrice } from './calc.mjs';
import {
  FIELD_IDS,
  OPTIONAL_FIELD_IDS,
  REQUIRED_FIELD_IDS,
  encodeInputs,
  decodeInputs,
  formValues,
} from './share.mjs';

const SAMPLE = {
  filamentUsedGrams: 60, filamentCostPerKg: 25, printTimeHours: 4.5,
  printerWattage: 150, electricityCostPerKwh: 0.14, printerCost: 400,
  printerLifetimeHours: 4000, failureRatePercent: 12, postProcessingMinutes: 15,
  laborRatePerHour: 25, packagingCost: 1.1, marketplaceFeePercent: 9,
  targetMarginPercent: 30, otherFixedCost: 0.5,
};

/** A scenario with a real price already being checked against it. */
const CHECKED = { ...SAMPLE, actualSellingPrice: 18.5 };

test('the required field list is derived from DEFAULTS, not restated', () => {
  assert.deepEqual([...REQUIRED_FIELD_IDS].sort(), Object.keys(DEFAULTS).sort());
});

test('actualSellingPrice is the one optional field, named once', () => {
  assert.deepEqual([...OPTIONAL_FIELD_IDS], ['actualSellingPrice']);
  assert.deepEqual([...FIELD_IDS], [...REQUIRED_FIELD_IDS, ...OPTIONAL_FIELD_IDS]);
});

test('SAMPLE covers every required field the arithmetic reads', () => {
  assert.deepEqual(Object.keys(SAMPLE).sort(), [...REQUIRED_FIELD_IDS].sort());
});

test('round-trips every known field, actualSellingPrice included', () => {
  const encoded = encodeInputs({ ...CHECKED, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], CHECKED[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a link built with nothing checked leaves actualSellingPrice out entirely, not encoded as zero', () => {
  const encoded = encodeInputs(SAMPLE);
  assert.ok(!new URLSearchParams(encoded).has('actualSellingPrice'), 'actualSellingPrice was encoded despite being unset');
  const decoded = decodeInputs(encoded);
  assert.ok(!('actualSellingPrice' in decoded), 'actualSellingPrice came back from a link that never carried it');
  assert.equal(calculatePrice(decoded).actual, null);
});

test('a link with a checked price computes the identical comparison on the other end', () => {
  // The defect a share link actually ships is a recipient who sees a
  // different (or missing) answer than the sender and never finds out.
  // Assert on the computed result, not only on the raw inputs.
  for (const input of [SAMPLE, CHECKED]) {
    const sender = calculatePrice(input);
    const recipient = calculatePrice(decodeInputs(encodeInputs(input)));
    assert.deepEqual(recipient, sender);
  }
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?printerCost=250'), { printerCost: 250 });
  assert.deepEqual(decodeInputs('#printerCost=250'), { printerCost: 250 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('printerCost=abc&packagingCost=1'), { packagingCost: 1 });
  assert.equal(encodeInputs({ printerCost: -5 }).includes('printerCost='), false);
});

test('a zero value round-trips rather than being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, otherFixedCost: 0 });
  assert.equal(decodeInputs(encoded).otherFixedCost, 0);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('formValues covers every field the form owns, including actualSellingPrice, not just the ones a link carried', () => {
  const values = formValues({ printerCost: 250 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving a stale value', () => {
  const { printerCost, printerLifetimeHours, ...withoutPrinter } = SAMPLE;
  const encoded = encodeInputs(withoutPrinter);
  const decoded = decodeInputs(encoded);
  const values = formValues(decoded);
  assert.equal(values.printerCost, '');
  assert.equal(values.printerLifetimeHours, '');
  assert.equal(values.filamentUsedGrams, String(SAMPLE.filamentUsedGrams));
});

test('formValues clears actualSellingPrice when the link had nothing checked, so a recipient sees the sender\'s scenario', () => {
  // Without this, a shared no-price-checked scenario opens on top of the
  // recipient's own leftover actualSellingPrice, and they check a
  // stranger's number against this scenario's cost while believing nothing
  // was entered. Nothing on screen would say so.
  const values = formValues(decodeInputs(encodeInputs(SAMPLE)));
  assert.equal(values.actualSellingPrice, '', 'actualSellingPrice was left for the recipient\'s own leftover value to fill');
  assert.deepEqual(calculatePrice(values), calculatePrice(SAMPLE));
});

test('formValues round-trips a checked price as a form string', () => {
  const values = formValues(decodeInputs(encodeInputs(CHECKED)));
  for (const id of FIELD_IDS) {
    assert.equal(values[id], String(CHECKED[id]), `${id} differs as a form value`);
  }
  assert.deepEqual(calculatePrice(values), calculatePrice(CHECKED));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
