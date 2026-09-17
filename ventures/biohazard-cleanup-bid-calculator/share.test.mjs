import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, computeJobBid } from './calc.mjs';
import {
  FIELD_IDS,
  OPTIONAL_FIELD_IDS,
  REQUIRED_FIELD_IDS,
  encodeInputs,
  decodeInputs,
  formValues,
} from './share.mjs';

const SAMPLE = {
  technicianCount: 3, hoursOnSitePerTechnician: 6, laborRatePerHour: 50,
  deconCyclesPerTechnician: 2, ppeCostPerSet: 42, suppliesCost: 140,
  equipmentRentalCost: 100, biohazardWastePounds: 90, containerCapacityPounds: 40,
  costPerContainer: 120, travelFee: 60, minimumJobFee: 700, targetMarginPercent: 28,
};

/** A scenario with a real quoted price already being checked against it. */
const CHECKED = { ...SAMPLE, proposedPrice: 1500 };

test('the required field list is derived from DEFAULTS, not restated', () => {
  assert.deepEqual([...REQUIRED_FIELD_IDS].sort(), Object.keys(DEFAULTS).sort());
});

test('proposedPrice is the one optional field, named once', () => {
  assert.deepEqual([...OPTIONAL_FIELD_IDS], ['proposedPrice']);
  assert.deepEqual([...FIELD_IDS], [...REQUIRED_FIELD_IDS, ...OPTIONAL_FIELD_IDS]);
});

test('SAMPLE covers every required field the arithmetic reads', () => {
  assert.deepEqual(Object.keys(SAMPLE).sort(), [...REQUIRED_FIELD_IDS].sort());
});

test('round-trips every known field, proposedPrice included', () => {
  const encoded = encodeInputs({ ...CHECKED, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], CHECKED[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a link built with nothing checked leaves proposedPrice out entirely, not encoded as zero', () => {
  const encoded = encodeInputs(SAMPLE);
  assert.ok(!new URLSearchParams(encoded).has('proposedPrice'), 'proposedPrice was encoded despite being unset');
  const decoded = decodeInputs(encoded);
  assert.ok(!('proposedPrice' in decoded), 'proposedPrice came back from a link that never carried it');
  assert.equal(computeJobBid(decoded).proposed, null);
});

test('a link with a checked price computes the identical comparison on the other end', () => {
  for (const input of [SAMPLE, CHECKED]) {
    const sender = computeJobBid(input);
    const recipient = computeJobBid(decodeInputs(encodeInputs(input)));
    assert.deepEqual(recipient, sender);
  }
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?technicianCount=3'), { technicianCount: 3 });
  assert.deepEqual(decodeInputs('#technicianCount=3'), { technicianCount: 3 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('technicianCount=abc&suppliesCost=1'), { suppliesCost: 1 });
  assert.equal(encodeInputs({ technicianCount: -5 }).includes('technicianCount='), false);
});

test('a zero value round-trips rather than being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, biohazardWastePounds: 0 });
  assert.equal(decodeInputs(encoded).biohazardWastePounds, 0);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('formValues covers every field the form owns, including proposedPrice, not just the ones a link carried', () => {
  const values = formValues({ technicianCount: 3 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving a stale value', () => {
  const { technicianCount, hoursOnSitePerTechnician, ...withoutCrew } = SAMPLE;
  const encoded = encodeInputs(withoutCrew);
  const decoded = decodeInputs(encoded);
  const values = formValues(decoded);
  assert.equal(values.technicianCount, '');
  assert.equal(values.hoursOnSitePerTechnician, '');
  assert.equal(values.laborRatePerHour, String(SAMPLE.laborRatePerHour));
});

test('formValues clears proposedPrice when the link had nothing checked, so a recipient sees the sender\'s scenario', () => {
  const values = formValues(decodeInputs(encodeInputs(SAMPLE)));
  assert.equal(values.proposedPrice, '', 'proposedPrice was left for the recipient\'s own leftover value to fill');
  assert.deepEqual(computeJobBid(values), computeJobBid(SAMPLE));
});

test('formValues round-trips a checked price as a form string', () => {
  const values = formValues(decodeInputs(encodeInputs(CHECKED)));
  for (const id of FIELD_IDS) {
    assert.equal(values[id], String(CHECKED[id]), `${id} differs as a form value`);
  }
  assert.deepEqual(computeJobBid(values), computeJobBid(CHECKED));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
