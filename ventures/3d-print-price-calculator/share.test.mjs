import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from './calc.mjs';
import { FIELD_IDS, OPTIONAL_FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

const SAMPLE = {
  filamentUsedGrams: 60, filamentCostPerKg: 25, printTimeHours: 4.5,
  printerWattage: 150, electricityCostPerKwh: 0.14, printerCost: 400,
  printerLifetimeHours: 4000, failureRatePercent: 12, postProcessingMinutes: 15,
  laborRatePerHour: 25, packagingCost: 1.1, marketplaceFeePercent: 9,
  targetMarginPercent: 30, otherFixedCost: 0.5,
};

test('FIELD_IDS is derived from DEFAULTS, not restated', () => {
  assert.deepEqual(FIELD_IDS.sort(), Object.keys(DEFAULTS).sort());
});

test('SAMPLE covers every field the arithmetic reads', () => {
  assert.deepEqual(Object.keys(SAMPLE).sort(), [...FIELD_IDS].sort());
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

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ printerCost: 250 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS, ...OPTIONAL_FIELD_IDS].sort());
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

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of [...FIELD_IDS, ...OPTIONAL_FIELD_IDS]) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of [...FIELD_IDS, ...OPTIONAL_FIELD_IDS]) assert.equal(values[id], '');
});

// The bug this pins: `actualSellingPrice` is a real, optional input
// (calc.mjs reads it, the form has a dedicated field for it) that was never
// added to DEFAULTS, so it silently fell out of every share link and saved
// draft -- caught by the catalogue's browser roundtrip check, which found a
// share link that dropped a maker's typed selling price on the way back.
test('OPTIONAL_FIELD_IDS names the one field the arithmetic accepts but does not require', () => {
  assert.deepEqual(OPTIONAL_FIELD_IDS, ['actualSellingPrice']);
});

test('a share link round-trips the optional actual-selling-price check, not just the required fields', () => {
  const encoded = encodeInputs({ ...SAMPLE, actualSellingPrice: 45.5 });
  assert.equal(decodeInputs(`#${encoded}`).actualSellingPrice, 45.5);
});

test('formValues writes the optional field from a link and clears it when the link omits it', () => {
  const withPrice = formValues(decodeInputs(encodeInputs({ ...SAMPLE, actualSellingPrice: 45.5 })));
  assert.equal(withPrice.actualSellingPrice, '45.5');
  const withoutPrice = formValues(decodeInputs(encodeInputs(SAMPLE)));
  assert.equal(withoutPrice.actualSellingPrice, '');
});
