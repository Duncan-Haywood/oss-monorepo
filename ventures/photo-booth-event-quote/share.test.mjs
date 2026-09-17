import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculateQuote } from './calc.mjs';
import { SHARE_FIELDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('the shared field set is derived from the calculator, not restated', () => {
  // If a field is added to DEFAULTS and the link does not carry it, the
  // recipient prices a different booking. Deriving is what keeps that from
  // being possible; this asserts the derivation rather than a copied list.
  for (const field of Object.keys(DEFAULTS)) assert.ok(SHARE_FIELDS.includes(field), field);
  assert.ok(SHARE_FIELDS.includes('proposedPrice'));
  assert.equal(SHARE_FIELDS.length, Object.keys(DEFAULTS).length + 1);
});

test('round-trips every known field and drops junk', () => {
  const encoded = encodeInputs({ ...DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of Object.keys(DEFAULTS)) assert.equal(decoded[field], DEFAULTS[field]);
  assert.equal(decoded.unknown, undefined);
});

test('a negative figure is not carried', () => {
  assert.equal(encodeInputs({ ...DEFAULTS, attendantHourlyRate: -4 }).includes('attendantHourlyRate='), false);
});

test('ignores a crafted non-numeric query value', () => {
  assert.deepEqual(decodeInputs('eventHours=abc&attendantCount=2'), { attendantCount: 2 });
});

test('a shared link reproduces the sender price exactly', () => {
  const sent = { ...DEFAULTS, eventHours: 5, expectedPrints: 420, attendantCount: 2 };
  const received = decodeInputs(`#${encodeInputs(sent)}`);
  assert.deepEqual(calculateQuote(received), calculateQuote(sent));
});

test('an optional proposed price travels, and a blank one stays blank', () => {
  assert.equal(decodeInputs(encodeInputs({ ...DEFAULTS, proposedPrice: 650 })).proposedPrice, 650);
  const blank = decodeInputs(encodeInputs({ ...DEFAULTS, proposedPrice: '' }));
  assert.equal(blank.proposedPrice, '');
  // Blank must not become zero: a $0 proposed price reads as "below
  // breakeven" on a booking nobody quoted.
  assert.equal(calculateQuote(blank).proposed, null);
  assert.notEqual(calculateQuote({ ...DEFAULTS, proposedPrice: 0 }).proposed, null);
});

test('shared links distinguish blank, zero and absent fields', () => {
  assert.deepEqual(decodeInputs(encodeInputs({ otherCost: 0, proposedPrice: '' })),
    { otherCost: 0, proposedPrice: '' });
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  assert.deepEqual(Object.keys(formValues({ eventHours: 4 })).sort(), [...SHARE_FIELDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it standing', () => {
  const { attendantCount, ...withoutCount } = DEFAULTS;
  const values = formValues(decodeInputs(encodeInputs(withoutCount)));
  assert.equal(values.attendantCount, '');
  assert.equal(values.eventHours, String(DEFAULTS.eventHours));
});

test('formValues on an empty decode, or none at all, clears the whole form', () => {
  for (const values of [formValues({}), formValues()]) {
    for (const field of SHARE_FIELDS) assert.equal(values[field], '');
  }
});
