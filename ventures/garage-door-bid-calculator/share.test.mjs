import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS } from './share.mjs';

test('a round trip keeps door size and travel figures, not just the job type', () => {
  const input = {
    jobType: 'replacement_with_opener',
    widthFt: 16,
    heightFt: 8,
    doorCost: 1600,
    springCost: 175,
    openerCost: 380,
    hardwareCost: 90,
    disposalCost: 45,
    permitCost: 0,
    laborHours: 5.5,
    hourlyWage: 28,
    burdenRate: 30,
    roundTripMiles: 24,
    costPerMile: 0.75,
    averageMph: 30,
    afterHoursMultiplier: 1.5,
    overheadRate: 15,
    targetMargin: 25,
    proposedPrice: 2600,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.jobType, 'replacement_with_opener');
  assert.equal(restored.widthFt, 16);
  assert.equal(restored.heightFt, 8);
  assert.equal(restored.roundTripMiles, 24);
  assert.equal(restored.afterHoursMultiplier, 1.5);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 2600);
});

test('every numeric field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link.
  assert.equal(NUMBER_FIELD_IDS.length, 18);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('widthFt=16&wageSecret=99&jobType=spring_only');
  assert.deepEqual(Object.keys(restored).sort(), ['jobType', 'widthFt']);
  assert.equal(restored.widthFt, 16);
});

test('an unknown job type is dropped rather than accepted', () => {
  const restored = decodeInputs('jobType=demolition&widthFt=10');
  assert.equal('jobType' in restored, false);
  assert.equal(restored.widthFt, 10);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('roundTripMiles=-5&hourlyWage=abc&doorCost=1200');
  assert.equal('roundTripMiles' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.doorCost, 1200);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#widthFt=18').widthFt, 18);
  assert.equal(decodeInputs('?doorCost=1900').doorCost, 1900);
  const encoded = encodeInputs({ jobType: 'spring_only', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the kit selectors round-trip, including a hand-priced "custom" door', () => {
  // The regression platform/pages/roundtrip.mjs caught: these three were
  // omitted on the reasoning that their effect already rides in the numeric
  // fields. The price did survive, but a sender who picked "Custom size"
  // because they hand-priced the door handed over a bid labelled
  // `double_16x7`, and proposalScope (generated from the construction label)
  // then named a different door on the recipient's customer-facing copy.
  const encoded = encodeInputs({
    doorSize: 'custom', construction: 'non_insulated', opener: 'none', doorCost: '1450',
  });
  const restored = decodeInputs(encoded);
  assert.equal(restored.doorSize, 'custom');
  assert.equal(restored.construction, 'non_insulated');
  assert.equal(restored.opener, 'none');
  assert.equal(restored.doorCost, 1450);
});

test('an unknown value for any kit selector is dropped rather than accepted', () => {
  // Same allowlist discipline the job type already had: a crafted or stale
  // link can only set a value the form's own <select> could have produced.
  const restored = decodeInputs('doorSize=mansion&construction=titanium&opener=warp_drive&doorCost=900');
  assert.equal('doorSize' in restored, false);
  assert.equal('construction' in restored, false);
  assert.equal('opener' in restored, false);
  assert.equal(restored.doorCost, 900);
});
