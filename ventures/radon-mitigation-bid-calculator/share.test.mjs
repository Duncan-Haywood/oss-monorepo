import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps foundation, fan, discharge, every flag, and every rate field, not just the price fields', () => {
  const input = {
    footprintSqFt: 1400,
    suctionPoints: 2,
    membraneSqFt: 300,
    firestopCount: 3,
    includedFootprint: 1500,
    includedSuctionPoints: 1,
    hoursBaseSystem: 4,
    hoursPerExtra100SqFt: 0.3,
    hoursPerExtraSuction: 1.5,
    hoursCrawlMembrane: 2,
    hoursRoofDischarge: 1,
    hoursHighSuctionFan: 0.5,
    hoursNewCircuit: 1.5,
    hoursPostTest: 0.5,
    hoursPermit: 0.5,
    hoursPerFirestop: 0.25,
    siteHours: 0.75,
    fanCost: 185,
    pipeAndSealCost: 95,
    extraSuctionMaterial: 45,
    membranePerSqFt: 0.4,
    circuitCost: 125,
    testKitCost: 35,
    permitFee: 65,
    firestopCostEach: 15,
    hourlyWage: 34,
    burdenRate: 30,
    travelAndEquipment: 50,
    overheadRate: 15,
    targetMargin: 28,
    proposedPrice: 1450,
    crawlMembrane: true,
    newCircuit: true,
    postTest: false,
    permit: true,
    foundation: 'mixed',
    fan: 'high-suction',
    discharge: 'roof',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 25);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['crawlMembrane', 'newCircuit', 'permit', 'postTest']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['discharge', 'fan', 'foundation']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('footprintSqFt=1200&wageSecret=99&foundation=slab');
  assert.deepEqual(Object.keys(restored).sort(), ['footprintSqFt', 'foundation']);
  assert.equal(restored.footprintSqFt, 1200);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('foundation=cave&footprintSqFt=1200');
  assert.equal('foundation' in restored, false);
  assert.equal(restored.footprintSqFt, 1200);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('footprintSqFt=-5&hourlyWage=abc&suctionPoints=2');
  assert.equal('footprintSqFt' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.suctionPoints, 2);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#footprintSqFt=1200').footprintSqFt, 1200);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ foundation: 'basement', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a slab job with zero extras and every flag false still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    footprintSqFt: 1000, suctionPoints: 1, membraneSqFt: 0, firestopCount: 0,
    includedFootprint: 1500, includedSuctionPoints: 1,
    crawlMembrane: false, newCircuit: false, postTest: false, permit: false,
    foundation: 'slab', fan: 'standard', discharge: 'sidewall',
  }));
  assert.equal(restored.footprintSqFt, 1000);
  assert.equal(restored.membraneSqFt, 0);
  assert.equal(restored.crawlMembrane, false);
  assert.equal(restored.newCircuit, false);
  assert.equal(restored.postTest, false);
  assert.equal(restored.permit, false);
  assert.equal(restored.foundation, 'slab');
  assert.equal(restored.fan, 'standard');
  assert.equal(restored.discharge, 'sidewall');
});
