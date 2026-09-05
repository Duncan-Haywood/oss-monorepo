import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps the elevation, stories, trim, shutters, every flag, and every rate field, not just the price fields', () => {
  const input = {
    elevationSf: 2800,
    stories: 2,
    trimFeet: 240,
    shutters: 12,
    includedElevationSf: 1600,
    includedStories: 1,
    includedTrimFeet: 80,
    hoursBaseSetup: 6,
    hoursPer100Sf: 2.4,
    hoursPerExtraStory: 6,
    hoursScrapePer100: 1.8,
    hoursPrimePer100: 0.8,
    hoursTrimPer10Feet: 0.7,
    hoursPerShutter: 0.2,
    hoursOccupied: 2,
    hoursHardAccess: 5,
    siteHours: 1,
    finishCoats: 2,
    paintCoverage: 350,
    paintCostPerGallon: 48,
    primerCostPerGallon: 38,
    caulkPer10TrimFeet: 3.5,
    hourlyWage: 36,
    burdenRate: 32,
    travelAndEquipment: 85,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: 8500,
    scrape: true,
    prime: true,
    occupied: true,
    hardAccess: true,
    jobType: 'repaint',
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric, boolean, and enum field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 27);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['hardAccess', 'occupied', 'prime', 'scrape']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['jobType']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('elevationSf=2200&wageSecret=99&jobType=scrape');
  assert.deepEqual(Object.keys(restored).sort(), ['elevationSf', 'jobType']);
  assert.equal(restored.elevationSf, 2200);
});

test('an unknown job-type value is dropped rather than accepted', () => {
  const restored = decodeInputs('jobType=power-wash-only&elevationSf=1800');
  assert.equal('jobType' in restored, false);
  assert.equal(restored.elevationSf, 1800);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('trimFeet=-5&hourlyWage=abc&shutters=4');
  assert.equal('trimFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.shutters, 4);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#trimFeet=90').trimFeet, 90);
  assert.equal(decodeInputs('?shutters=0').shutters, 0);
  const encoded = encodeInputs({ jobType: 'bare', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('shutters of zero and every flag false still travel -- they are the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    shutters: 0, scrape: false, prime: false, occupied: false, hardAccess: false, trimFeet: 0,
  }));
  assert.equal(restored.shutters, 0);
  assert.equal(restored.scrape, false);
  assert.equal(restored.prime, false);
  assert.equal(restored.occupied, false);
  assert.equal(restored.hardAccess, false);
  assert.equal(restored.trimFeet, 0);
});
