import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps the system, pit, and discharge fields, not just the price fields', () => {
  const input = {
    systemId: 'interior_drain',
    pumpId: 'half',
    backupId: 'battery',
    perimeterLf: 120,
    wallHeightFt: 8,
    floorSqFt: 900,
    windowWells: 3,
    floorCrackLf: 20,
    wallCrackCount: 2,
    dischargeLf: 45,
    hoursPerDrainLf: 0.55,
    hoursPerExteriorLf: 0,
    hoursPer100Wall: 1.4,
    hoursPer100Floor: 0,
    hoursPerWell: 3.2,
    hoursPerFloorCrackLf: 0.35,
    hoursPerWallCrack: 1.8,
    hoursPerNewSump: 4.5,
    hoursPerExistingSump: 1,
    hoursPerDischargeLf: 0.12,
    hoursPerFreezeKit: 0.4,
    hoursPerPump: 1.4,
    hoursPerBackup: 1.5,
    hoursPerDehumidifier: 1.5,
    siteHours: 2,
    drainCostPerLf: 18,
    exteriorCostPerLf: 0,
    membraneCostPerSqFt: 2.4,
    vaporCostPerSqFt: 0,
    pourbackCostPerLf: 12,
    disposalPerLf: 8,
    wellCoverCost: 220,
    floorCrackCostPerLf: 8,
    wallCrackCost: 45,
    pitLinerCost: 380,
    pumpCost: 380,
    backupCost: 480,
    dischargeCostPerLf: 9,
    freezeKitCost: 185,
    dehumidifierCost: 650,
    hourlyWage: 36,
    burdenRate: 32,
    travelAndEquipment: 185,
    overheadRate: 15,
    targetMargin: 25,
    proposedPrice: 12500,
    newSumpPit: true,
    freezeDischarge: true,
    includeDehumidifier: false,
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
  assert.ok(NUMBER_FIELD_IDS.length >= 40);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['freezeDischarge', 'includeDehumidifier', 'newSumpPit'].sort());
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('perimeterLf=120&wageSecret=99&systemId=crawl_encapsulate');
  assert.deepEqual(Object.keys(restored).sort(), ['perimeterLf', 'systemId']);
  assert.equal(restored.perimeterLf, 120);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('pumpId=turbo&backupId=battery');
  assert.equal('pumpId' in restored, false);
  assert.equal(restored.backupId, 'battery');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('windowWells=-5&hourlyWage=abc&pitLinerCost=380');
  assert.equal('windowWells' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.pitLinerCost, 380);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#perimeterLf=120').perimeterLf, 120);
  assert.equal(decodeInputs('?pitLinerCost=380').pitLinerCost, 380);
  const encoded = encodeInputs({ systemId: 'exterior_excavate', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
