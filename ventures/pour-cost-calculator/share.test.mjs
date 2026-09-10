import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_INPUT_IDS,
  OPTIONAL_INGREDIENT_IDS,
  REQUIRED_INGREDIENT_IDS,
  calculatePourCost,
} from './calc.mjs';
import {
  FIELD_IDS,
  OPTIONAL_FIELD_IDS,
  REQUIRED_FIELD_IDS,
  decodeInputs,
  encodeInputs,
  formValues,
  hasSharedInputs,
} from './share.mjs';

/** A full three-ingredient cocktail: every field the form owns. */
const cocktail = Object.freeze({
  primaryBottleCost: 24.5,
  primaryBottleSizeOz: 25.4,
  primaryOzUsed: 2,
  modifierBottleCost: 18,
  modifierBottleSizeOz: 25.4,
  modifierOzUsed: 0.5,
  mixerBottleCost: 6.5,
  mixerBottleSizeOz: 33.8,
  mixerOzUsed: 4,
  menuPrice: 14,
  targetPourCostPercent: 20,
  drinksPerWeek: 200,
  overPourOzPerDrink: 0.25,
});

/** A spirit-only pour: both optional slots deliberately unused. */
const highball = Object.freeze({
  primaryBottleCost: 24.5,
  primaryBottleSizeOz: 25.4,
  primaryOzUsed: 2,
  menuPrice: 12,
  targetPourCostPercent: 20,
  drinksPerWeek: 150,
  overPourOzPerDrink: 0,
});

test("the shared field list is calc.mjs's own, not a copy", () => {
  assert.deepEqual([...FIELD_IDS], [...ALL_INPUT_IDS]);
  assert.deepEqual([...OPTIONAL_FIELD_IDS], [...OPTIONAL_INGREDIENT_IDS]);
  assert.deepEqual([...REQUIRED_FIELD_IDS], [...REQUIRED_INGREDIENT_IDS]);
});

test('a full recipe survives a round trip field by field', () => {
  const decoded = decodeInputs(encodeInputs(cocktail));
  assert.deepEqual(decoded, cocktail);
  for (const id of ALL_INPUT_IDS) {
    assert.equal(decoded[id], cocktail[id], `${id} did not survive the round trip`);
  }
});

test('a round-tripped link computes the identical pour cost', () => {
  // The defect a share link actually ships is a recipient who sees a
  // different number than the sender and never finds out. Assert on the
  // answer, not only on the inputs.
  for (const recipe of [cocktail, highball]) {
    const sender = calculatePourCost(recipe);
    const recipient = calculatePourCost(decodeInputs(encodeInputs(recipe)));
    assert.equal(sender.ok, true);
    assert.deepEqual(recipient, sender);
  }
});

test('an unused ingredient slot stays unused rather than becoming a zero-cost pour', () => {
  // Encoded as 0 the recipe would gain two ingredients that cost nothing,
  // and `calc.mjs` treats a partial slot as a typo it must report.
  const encoded = encodeInputs(highball);
  const params = new URLSearchParams(encoded);
  for (const id of OPTIONAL_INGREDIENT_IDS) {
    assert.ok(!params.has(id), `${id} was encoded despite the slot being unused`);
  }
  const decoded = decodeInputs(encoded);
  for (const id of OPTIONAL_INGREDIENT_IDS) {
    assert.ok(!(id in decoded), `${id} came back from a link that never carried it`);
  }
  assert.equal(calculatePourCost(decoded).ok, true);
});

test("formValues clears what the link did not carry, so a recipient sees the sender's drink", () => {
  // The trap this page has and its siblings do not. Without the clearing, a
  // shared spirit-only pour opens on top of the recipient's own default
  // modifier and mixer, and they price a three-ingredient cocktail believing
  // it is the sender's highball. Nothing on screen would say so.
  const values = formValues(decodeInputs(encodeInputs(highball)));
  assert.deepEqual(Object.keys(values).sort(), [...ALL_INPUT_IDS].sort());
  for (const id of OPTIONAL_INGREDIENT_IDS) {
    assert.equal(values[id], '', `${id} was left for the recipient's own default to fill`);
  }
  assert.equal(values.primaryOzUsed, '2');
  // And the cleared form computes the sender's answer, not a hybrid drink.
  assert.deepEqual(calculatePourCost(values), calculatePourCost(highball));
});

test('formValues round-trips a full recipe as form strings', () => {
  const values = formValues(decodeInputs(encodeInputs(cocktail)));
  for (const id of ALL_INPUT_IDS) {
    assert.equal(values[id], String(cocktail[id]), `${id} differs as a form value`);
  }
  assert.deepEqual(calculatePourCost(values), calculatePourCost(cocktail));
});

test('an empty string is dropped, not encoded as zero', () => {
  for (const id of ALL_INPUT_IDS) {
    const params = new URLSearchParams(encodeInputs({ ...cocktail, [id]: '' }));
    assert.ok(!params.has(id), `${id} was encoded despite being blank`);
  }
  // Whitespace is blank too — `calc.mjs`'s own isBlank trims, and the two
  // must agree or a space-filled field encodes as NaN.
  assert.ok(!new URLSearchParams(encodeInputs({ ...cocktail, mixerOzUsed: '   ' })).has('mixerOzUsed'));
});

test('values arriving as form strings encode the same as numbers', () => {
  // The page reads `el(id).value`, which is always a string. If the two
  // disagreed, only a real visitor would find out.
  const asStrings = Object.fromEntries(ALL_INPUT_IDS.map((id) => [id, String(cocktail[id])]));
  assert.equal(encodeInputs(asStrings), encodeInputs(cocktail));
});

test('junk in the fragment is ignored rather than trusted', () => {
  assert.deepEqual(
    decodeInputs('#primaryBottleCost=abc&menuPrice=-3&primaryOzUsed=&drinksPerWeek=150'),
    { drinksPerWeek: 150 },
  );
});

test('unknown parameters in a link are not carried onto the form', () => {
  const decoded = decodeInputs(`#${encodeInputs(cocktail)}&utm_source=sms&__proto__=x`);
  assert.deepEqual(Object.keys(decoded).sort(), [...ALL_INPUT_IDS].sort());
});

test('both fragment and query forms decode', () => {
  const query = encodeInputs(cocktail);
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
  assert.equal(hasSharedInputs(decodeInputs(encodeInputs(highball))), true);
  assert.equal(hasSharedInputs(decodeInputs('#menuPrice=14')), true);
  assert.equal(hasSharedInputs({}), false);
});

test('a required field missing from a link is reported, never substituted', () => {
  // Backs the claim in share.mjs's comment: a partial link leaves a blank box
  // the calculator complains about, rather than a plausible wrong number.
  for (const id of REQUIRED_INGREDIENT_IDS) {
    const { [id]: _omitted, ...rest } = cocktail;
    const values = formValues(rest);
    assert.equal(values[id], '');
    assert.equal(calculatePourCost(values).ok, false, `${id} was missing and calc.mjs accepted it`);
  }
});
