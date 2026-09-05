import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps attachment, roof, ceiling, mesh, height, and every rate field', () => {
  const input = {
    attachment: 'freestanding',
    roof: 'screen-roof',
    ceiling: 'beadboard',
    mesh: 'hurricane',
    height: '10',
    widthFeet: 16,
    depthFeet: 12,
    kneeWallInches: 36,
    panelWidthInches: 36,
    doorCount: 2,
    hoursTrip: 1.5,
    hoursPerPanel: 0.8,
    extraHoursPerPanel: 0.2,
    hoursPer100SfScreen: 2.5,
    hoursPerKneeLf: 0.15,
    hoursPer100SfRoof: 3.2,
    hoursPer100SfCeiling: 2.8,
    hoursPerDoor: 1.2,
    hoursFan: 1.5,
    hoursDemo: 2,
    hoursSite: 1,
    siteHours: 1,
    wallHeightFeet: 10,
    perimeterLf: 56,
    wallScreenSf: 560,
    roofSf: 192,
    ceilingSf: 192,
    kneeWallLf: 56,
    panelCount: 19,
    screenPerSf: 1.2,
    panelEach: 45,
    kneeWallPerLf: 8.5,
    roofPerSf: 6.5,
    ceilingPerSf: 3.2,
    doorEach: 220,
    hardwareLump: 65,
    fanFee: 180,
    demoFee: 250,
    mobilizationFee: 150,
    permitFee: 100,
    hourlyWage: 34,
    burdenRate: 30,
    travelAndEquipment: 120,
    overheadRate: 15,
    targetMargin: 25,
    proposedPrice: 9800,
    includeFan: true,
    includePermit: true,
    demoExisting: true,
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
  assert.ok(NUMBER_FIELD_IDS.length >= 30);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['demoExisting', 'includeFan', 'includePermit'].sort());
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('widthFeet=12&wageSecret=99&attachment=attached');
  assert.deepEqual(Object.keys(restored).sort(), ['attachment', 'widthFeet']);
  assert.equal(restored.widthFeet, 12);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('attachment=floating&roof=existing&ceiling=marble&mesh=fiberglass&height=20');
  assert.equal('attachment' in restored, false);
  assert.equal(restored.roof, 'existing');
  assert.equal('ceiling' in restored, false);
  assert.equal(restored.mesh, 'fiberglass');
  assert.equal('height' in restored, false);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('widthFeet=-5&hourlyWage=abc&doorCount=2');
  assert.equal('widthFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.doorCount, 2);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#widthFeet=12').widthFeet, 12);
  assert.equal(decodeInputs('?doorCount=1').doorCount, 1);
  const encoded = encodeInputs({ attachment: 'attached', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the $55/sf special (no knee wall, no fan, no permit, no demo) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    attachment: 'attached', roof: 'existing', ceiling: 'none', mesh: 'fiberglass', height: '8',
    widthFeet: 12, depthFeet: 10, kneeWallInches: 0, doorCount: 1,
    includeFan: false, includePermit: false, demoExisting: false,
  }));
  assert.equal(restored.kneeWallInches, 0);
  assert.equal(restored.includeFan, false);
  assert.equal(restored.includePermit, false);
  assert.equal(restored.demoExisting, false);
  assert.equal(restored.attachment, 'attached');
  assert.equal(restored.roof, 'existing');
  assert.equal(restored.ceiling, 'none');
});
