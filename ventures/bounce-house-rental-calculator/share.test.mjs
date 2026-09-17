import test from 'node:test';
import assert from 'node:assert/strict';
import { COST_IDS, UNIT_FIELDS, UNIT_PRESETS, calculateQuote } from './calc.mjs';
import { SHARE_PARAMS, encodeInputs, decodeInputs, formValues, carriesAnything } from './share.mjs';

// The page's own shape: scalars keyed by id, fleet keyed by preset id.
const SCENARIO = {
  eventDays: 1, setupMinutesPerUnit: 25, teardownMinutesPerUnit: 20, crewSize: 2, laborRate: 22,
  deliveryFee: 45, pickupFee: 35, milesOneWay: 14, ratePerMile: 1.1, generatorFee: 60,
  attendantHours: 4, attendantRate: 20, insuranceRatePct: 1.5, consumablesPerUnit: 8, otherCost: 0,
  overheadRate: 12, targetMargin: 35, proposedPrice: '',
  generatorNeeded: true,
  units: {
    'bounce-standard': { quantity: 2, dailyRate: 150, replacementValue: 1800 },
    'water-slide': { quantity: 1, dailyRate: 275, replacementValue: 3800 },
  },
};

// What calculateQuote wants: a units array, filtered to what is going out.
function toQuoteInput(decoded) {
  const units = UNIT_PRESETS
    .map(preset => ({ ...preset, ...decoded.units?.[preset.id] }))
    .filter(unit => Number(unit.quantity) > 0)
    .map(unit => ({
      name: unit.label, wet: unit.wet,
      quantity: unit.quantity, dailyRate: unit.dailyRate, replacementValue: unit.replacementValue,
    }));
  return { ...decoded, units };
}

test('every field the calculator reads is a parameter the link carries', () => {
  for (const id of COST_IDS) assert.ok(SHARE_PARAMS.includes(id), `${id} is not shared`);
  assert.ok(SHARE_PARAMS.includes('generatorNeeded'));
  for (const preset of UNIT_PRESETS) {
    for (const field of UNIT_FIELDS) {
      assert.ok(SHARE_PARAMS.includes(`${preset.id}.${field}`), `${preset.id}.${field} is not shared`);
    }
  }
  assert.equal(SHARE_PARAMS.length, COST_IDS.length + 1 + UNIT_PRESETS.length * UNIT_FIELDS.length);
});

test('a shared link reproduces the sender price exactly, fleet included', () => {
  const decoded = decodeInputs(`#${encodeInputs(SCENARIO)}`);
  assert.deepEqual(calculateQuote(toQuoteInput(decoded)), calculateQuote(toQuoteInput(SCENARIO)));
  assert.ok(calculateQuote(toQuoteInput(decoded)).price > 0);
});

test('the fleet round-trips per preset rather than as one blob', () => {
  const decoded = decodeInputs(encodeInputs(SCENARIO));
  assert.deepEqual(decoded.units['bounce-standard'], { quantity: 2, dailyRate: 150, replacementValue: 1800 });
  assert.deepEqual(decoded.units['water-slide'], { quantity: 1, dailyRate: 275, replacementValue: 3800 });
  // A preset the sender is not deploying is left out of the URL entirely
  // rather than spelled out as three zeros -- five presets would otherwise
  // cost fifteen parameters on every link regardless of the fleet. The
  // recipient still ends up with the sender's fleet and not a union of both,
  // because `formValues` zeroes what the link did not carry; that is the
  // assertion immediately below and in 'a preset the link does not carry'.
  assert.equal(decoded.units['dunk-tank'], undefined);
  assert.equal(formValues(decoded)['qty-dunk-tank'], '0');
});

test('the generator toggle survives in both directions', () => {
  assert.equal(decodeInputs(encodeInputs({ ...SCENARIO, generatorNeeded: true })).generatorNeeded, true);
  assert.equal(decodeInputs(encodeInputs({ ...SCENARIO, generatorNeeded: false })).generatorNeeded, false);
});

test('a crafted link cannot invent a unit row or a negative figure', () => {
  const decoded = decodeInputs('not-a-preset.quantity=9&laborRate=-5&crewSize=abc&eventDays=2');
  assert.equal(decoded.units['not-a-preset'], undefined);
  assert.equal(decoded.laborRate, undefined);
  assert.equal(decoded.crewSize, undefined);
  assert.equal(decoded.eventDays, 2);
});

test('a blank cost box travels as blank rather than as absent', () => {
  const decoded = decodeInputs(encodeInputs({ ...SCENARIO, otherCost: '' }));
  assert.equal(decoded.otherCost, '');
  assert.equal(formValues(decoded).otherCost, '');
});

test('formValues writes every box on the page, clearing one the link omitted', () => {
  const { laborRate, ...withoutLabor } = SCENARIO;
  const values = formValues(decodeInputs(encodeInputs(withoutLabor)));
  assert.equal(values.laborRate, '', 'an omitted cost must be cleared, not left standing');
  assert.equal(values.crewSize, String(SCENARIO.crewSize));
  for (const id of COST_IDS) assert.ok(id in values, `${id} is not written`);
  for (const preset of UNIT_PRESETS) {
    for (const key of [`qty-${preset.id}`, `rate-${preset.id}`, `val-${preset.id}`]) {
      assert.ok(key in values, `${key} is not written`);
    }
  }
});

test('a preset the link does not carry is zeroed, not blanked', () => {
  // Blanking it would mark the form invalid; zero is what "this unit is not
  // going out" actually means to the quantity input and to calculateQuote.
  const values = formValues({ units: {} });
  for (const preset of UNIT_PRESETS) {
    assert.equal(values[`qty-${preset.id}`], '0');
    // Rate and replacement value fall back to the preset's own figures rather
    // than to blank, so the row stays priceable the moment a quantity is typed.
    assert.equal(values[`rate-${preset.id}`], String(preset.dailyRate));
    assert.equal(values[`val-${preset.id}`], String(preset.replacementValue));
  }
});

test('carriesAnything tells a real link from a bare page load', () => {
  assert.equal(carriesAnything(decodeInputs('')), false);
  assert.equal(carriesAnything(decodeInputs('eventDays=2')), true);
  assert.equal(carriesAnything(decodeInputs('bounce-standard.quantity=3')), true);
  assert.equal(carriesAnything(decodeInputs('generatorNeeded=1')), true);
  assert.equal(carriesAnything(undefined), false);
});
