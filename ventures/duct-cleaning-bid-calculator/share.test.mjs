import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps the job type, systems, vents, coil, sanitizer, and every rate field, not just the price fields', () => {
  const input = {
    jobType: 'two_system',
    systems: 2,
    vents: 18,
    returns: 3,
    stories: 2,
    includedSystems: 1,
    includedVents: 10,
    includedReturns: 1,
    includedStories: 1,
    hoursBaseSetup: 3,
    hoursPerExtraSystem: 1.6,
    hoursPerExtraVent: 0.12,
    hoursPerExtraReturn: 0.3,
    hoursPerExtraStory: 0.8,
    hoursCrawl: 0.8,
    hoursOccupied: 0.35,
    hoursCoil: 0.85,
    hoursSanitizer: 0.3,
    hoursHeavyDebris: 0.7,
    siteHours: 0.4,
    filterCost: 22,
    consumables: 12,
    sanitizerCost: 18,
    hourlyWage: 32,
    burdenRate: 28,
    travelAndEquipment: 48,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: 850,
    crawl: true,
    occupied: true,
    coil: true,
    sanitizer: true,
    heavyDebris: false,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 28);
  assert.deepEqual(
    BOOLEAN_FIELD_IDS.sort(),
    ['crawl', 'occupied', 'coil', 'sanitizer', 'heavyDebris'].sort(),
  );
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('vents=18&wageSecret=99&jobType=heavy');
  assert.deepEqual(Object.keys(restored).sort(), ['jobType', 'vents']);
  assert.equal(restored.vents, 18);
});

test('an unknown job type is dropped rather than accepted', () => {
  const restored = decodeInputs('jobType=luxury&systems=2');
  assert.equal('jobType' in restored, false);
  assert.equal(restored.systems, 2);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('vents=-5&hourlyWage=abc&filterCost=22');
  assert.equal('vents' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.filterCost, 22);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#vents=18').vents, 18);
  assert.equal(decodeInputs('?filterCost=22').filterCost, 22);
  const encoded = encodeInputs({ jobType: 'commercial', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a returns count of zero and heavyDebris false still travel -- they are the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({ returns: 0, heavyDebris: false, vents: 10 }));
  assert.equal(restored.returns, 0);
  assert.equal(restored.heavyDebris, false);
  assert.equal(restored.vents, 10);
});
