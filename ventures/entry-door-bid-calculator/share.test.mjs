import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps the configuration, material, hang style, access, rot, and every rate field, not just the price fields', () => {
  const input = {
    rotFeet: 8,
    hoursTrip: 1,
    hoursHang: 4.6,
    hoursHangPremium: 0.3,
    hangHourFactor: 1,
    hoursStory: 0.9,
    hoursOutOfSquare: 1.5,
    hoursPerRotFoot: 0.45,
    hoursTransom: 1.25,
    hoursBrickmold: 1.2,
    hoursStormDoor: 1.5,
    hoursSmartLock: 0.6,
    hoursPaint: 3.4,
    hoursTearOut: 1,
    siteHours: 0.5,
    unitCost: 980,
    unitCostMultiplier: 2.15,
    unitCostFactor: 1,
    transomCost: 220,
    brickmoldCost: 85,
    stormDoorCost: 280,
    lockCost: 95,
    paintMaterial: 48,
    rotPerFoot: 14,
    dumpFee: 45,
    permitFee: 0,
    hourlyWage: 42,
    burdenRate: 32,
    travelAndEquipment: 85,
    overheadRate: 16,
    targetMargin: 32,
    proposedPrice: 4500,
    outOfSquare: true,
    addTransom: true,
    addBrickmold: true,
    addStormDoor: true,
    addSmartLock: true,
    addPaint: true,
    tearOut: true,
    config: 'sidelite-two',
    material: 'fiberglass',
    hangStyle: 'prehung',
    stories: 'two',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 30);
  assert.deepEqual(
    BOOLEAN_FIELD_IDS.sort(),
    ['outOfSquare', 'addTransom', 'addBrickmold', 'addStormDoor', 'addSmartLock', 'addPaint', 'tearOut'].sort(),
  );
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['config', 'hangStyle', 'material', 'stories']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('rotFeet=8&wageSecret=99&config=double');
  assert.deepEqual(Object.keys(restored).sort(), ['config', 'rotFeet']);
  assert.equal(restored.rotFeet, 8);
});

test('an unknown enum value is dropped rather than accepted, for each of the four selects', () => {
  const restored = decodeInputs('config=triple&material=titanium&hangStyle=welded&stories=three&rotFeet=4');
  assert.equal('config' in restored, false);
  assert.equal('material' in restored, false);
  assert.equal('hangStyle' in restored, false);
  assert.equal('stories' in restored, false);
  assert.equal(restored.rotFeet, 4);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('rotFeet=-5&hourlyWage=abc&unitCost=420');
  assert.equal('rotFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.unitCost, 420);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#rotFeet=4').rotFeet, 4);
  assert.equal(decodeInputs('?unitCost=420').unitCost, 420);
  const encoded = encodeInputs({ config: 'single-36', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('rot footage of zero and tearOut false still travel -- they are the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({ rotFeet: 0, tearOut: false, unitCostMultiplier: 1 }));
  assert.equal(restored.rotFeet, 0);
  assert.equal(restored.tearOut, false);
  assert.equal(restored.unitCostMultiplier, 1);
});
