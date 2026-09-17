import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULTS, calculateQuote } from './calc.mjs';
import {
  FIELD_IDS,
  OPTIONAL_FIELD_IDS,
  REQUIRED_FIELD_IDS,
  decodeInputs,
  encodeInputs,
  formValues,
  hasSharedInputs,
} from './share.mjs';

/** A full booking: every required field, plus a price already on the table. */
const booking = Object.freeze({
  ...DEFAULTS,
  expectedGuests: 140,
  foodCostPerGuest: 6,
  proposedPrice: 2200,
});

/** The ordinary case: a quote with nothing proposed yet. */
const noProposal = Object.freeze({ ...DEFAULTS });

test("the required field list is calc.mjs's own DEFAULTS keys, not a copy", () => {
  assert.deepEqual([...REQUIRED_FIELD_IDS], Object.keys(DEFAULTS));
});

test('proposedPrice is the one optional field, named once', () => {
  assert.deepEqual([...OPTIONAL_FIELD_IDS], ['proposedPrice']);
  assert.deepEqual([...FIELD_IDS], [...REQUIRED_FIELD_IDS, ...OPTIONAL_FIELD_IDS]);
});

test('a full booking, proposed price included, survives a round trip field by field', () => {
  const decoded = decodeInputs(encodeInputs(booking));
  assert.deepEqual(decoded, booking);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], booking[id], `${id} did not survive the round trip`);
  }
});

test('a round-tripped link computes the identical quote', () => {
  // The defect a share link actually ships is a recipient who sees a
  // different number than the sender and never finds out. Assert on the
  // answer, not only on the inputs.
  for (const input of [booking, noProposal]) {
    const sender = calculateQuote(input);
    const recipient = calculateQuote(decodeInputs(encodeInputs(input)));
    assert.deepEqual(recipient, sender);
  }
});

test('proposedPrice is dropped, not encoded as zero, when the quote has nothing proposed yet', () => {
  // Encoded as 0 the recipient's proposed-price panel would show a $0 offer
  // on the table rather than "nothing proposed yet", and calc.mjs treats
  // those very differently -- one produces a proposed comparison, the other
  // does not.
  const encoded = encodeInputs(noProposal);
  assert.ok(!new URLSearchParams(encoded).has('proposedPrice'), 'proposedPrice was encoded despite being unset');
  const decoded = decodeInputs(encoded);
  assert.ok(!('proposedPrice' in decoded), 'proposedPrice came back from a link that never carried it');
  assert.equal(calculateQuote(decoded).proposed, null);
});

test("formValues clears proposedPrice when the link did not carry one, so a recipient sees the sender's quote", () => {
  // The trap this venture has and a plain-quote calculator does not. Without
  // the clearing, a shared no-proposal quote opens on top of the
  // recipient's own leftover proposedPrice, and they check a stranger's
  // number against this quote's breakeven while believing nothing was
  // proposed. Nothing on screen would say so.
  const values = formValues(decodeInputs(encodeInputs(noProposal)));
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
  assert.equal(values.proposedPrice, '', 'proposedPrice was left for the recipient\'s own leftover value to fill');
  assert.equal(values.expectedGuests, String(DEFAULTS.expectedGuests));
  // And the cleared form computes the sender's answer, not a hybrid quote.
  assert.deepEqual(calculateQuote(values), calculateQuote(noProposal));
});

test('formValues round-trips a full booking as form strings', () => {
  const values = formValues(decodeInputs(encodeInputs(booking)));
  for (const id of FIELD_IDS) {
    assert.equal(values[id], String(booking[id]), `${id} differs as a form value`);
  }
  assert.deepEqual(calculateQuote(values), calculateQuote(booking));
});

test('an empty string is dropped, not encoded as zero', () => {
  for (const id of FIELD_IDS) {
    const params = new URLSearchParams(encodeInputs({ ...booking, [id]: '' }));
    assert.ok(!params.has(id), `${id} was encoded despite being blank`);
  }
  // Whitespace is blank too, matching calc.mjs's own number() coercion, so a
  // space-filled field cannot encode as NaN.
  assert.ok(!new URLSearchParams(encodeInputs({ ...booking, staffCount: '   ' })).has('staffCount'));
});

test('a negative number is dropped rather than carried into a link', () => {
  // calc.mjs enforces min: 0 on every field; a link that could carry a
  // negative would restore a value the calculator would then reject anyway,
  // and worse, silently, since the form would show it rather than erroring.
  assert.ok(!new URLSearchParams(encodeInputs({ ...booking, mileageRate: -0.5 })).has('mileageRate'));
});

test('values arriving as form strings encode the same as numbers', () => {
  // The page reads `el(id).value`, which is always a string. If the two
  // disagreed, only a real visitor would find out.
  const asStrings = Object.fromEntries(FIELD_IDS.map((id) => [id, String(booking[id])]));
  assert.equal(encodeInputs(asStrings), encodeInputs(booking));
});

test('junk in the fragment is ignored rather than trusted', () => {
  assert.deepEqual(
    decodeInputs('#expectedGuests=abc&mileageRate=-3&staffCount=&targetMarginPct=30'),
    { targetMarginPct: 30 },
  );
});

test('unknown parameters in a link are not carried onto the form', () => {
  const decoded = decodeInputs(`#${encodeInputs(booking)}&utm_source=sms&__proto__=x`);
  assert.deepEqual(Object.keys(decoded).sort(), [...FIELD_IDS].sort());
});

test('both fragment and query forms decode', () => {
  const query = encodeInputs(booking);
  assert.deepEqual(decodeInputs(`#${query}`), decodeInputs(`?${query}`));
  assert.deepEqual(decodeInputs(query), decodeInputs(`#${query}`));
});

test('an empty or absent source decodes to nothing', () => {
  for (const source of ['', '#', '?', null, undefined]) {
    assert.deepEqual(decodeInputs(source), {});
    assert.equal(hasSharedInputs(decodeInputs(source)), false);
  }
});

test('hasSharedInputs decides whether the page opens on a link or its example', () => {
  assert.equal(hasSharedInputs(decodeInputs(encodeInputs(noProposal))), true);
  assert.equal(hasSharedInputs(decodeInputs('#targetMarginPct=30')), true);
  assert.equal(hasSharedInputs({}), false);
});
