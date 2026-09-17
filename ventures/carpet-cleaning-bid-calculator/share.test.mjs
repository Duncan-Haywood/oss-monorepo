import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInputs, decodeInputs, NUMBER_FIELD_IDS, ROOM_NAME_VALUES, UPHOLSTERY_NAME_VALUES,
} from './share.mjs';

test('a round trip keeps every room, every upholstery piece, and every cost field, not just the price fields', () => {
  const input = {
    rooms: [
      { name: 'Living room', squareFeet: 320, productionRate: 280, petTreatment: true },
      { name: 'Bedroom', squareFeet: 140, productionRate: 400, petTreatment: false },
      { name: 'Hall / landing', squareFeet: 60, productionRate: 280, petTreatment: false },
    ],
    upholstery: [
      { name: 'Sofa (3-seat)', minutes: 75 },
      { name: 'Armchair', minutes: 30 },
    ],
    stairFlights: 2,
    minutesPerFlight: 12,
    furnitureMoveMinutes: 25,
    travelMinutes: 40,
    extraPassMultiplier: 1,
    hourlyWage: 20,
    burdenRate: 30,
    chemicalsPerSqFt: 0.04,
    petChemistryPerRoom: 12,
    otherJobCost: 12,
    overheadRate: 15,
    targetMargin: 35,
    minimumCharge: 149,
    proposedPrice: 129,
  };
  const restored = decodeInputs(encodeInputs(input));

  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(restored[id], input[id], `${id} did not round-trip`);
  }
  assert.equal(restored.rooms.length, 3);
  for (const [index, room] of input.rooms.entries()) {
    assert.deepEqual(restored.rooms[index], room, `room ${index} did not round-trip`);
  }
  assert.equal(restored.upholstery.length, 2);
  for (const [index, piece] of input.upholstery.entries()) {
    assert.deepEqual(restored.upholstery[index], piece, `upholstery piece ${index} did not round-trip`);
  }
});

test('every numeric field the calculator uses is shareable', () => {
  // Guards against a new cost field being added to index.html and silently
  // never making it into a shared link -- the exact bug class share.mjs's own
  // header and CLAUDE.md's rename-drift note both describe.
  assert.deepEqual(NUMBER_FIELD_IDS.sort(), [
    'burdenRate', 'chemicalsPerSqFt', 'extraPassMultiplier', 'furnitureMoveMinutes',
    'hourlyWage', 'minimumCharge', 'minutesPerFlight', 'otherJobCost', 'overheadRate',
    'petChemistryPerRoom', 'proposedPrice', 'stairFlights', 'targetMargin', 'travelMinutes',
  ].sort());
});

test('every room-name preset and upholstery preset is a shareable enum value', () => {
  assert.ok(ROOM_NAME_VALUES.includes('Living room'));
  assert.ok(ROOM_NAME_VALUES.length >= 9);
  assert.ok(UPHOLSTERY_NAME_VALUES.includes('Sofa (3-seat)'));
  assert.ok(UPHOLSTERY_NAME_VALUES.length >= 6);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('stairFlights=2&wageSecret=99&hourlyWage=abc');
  assert.deepEqual(Object.keys(restored).sort(), ['stairFlights']);
  assert.equal(restored.stairFlights, 2);
});

test('an unknown room-name enum value is dropped from the cell, not accepted', () => {
  const restored = decodeInputs('rooms=Attic:100:280:0');
  assert.equal(restored.rooms.length, 1);
  assert.equal('name' in restored.rooms[0], false);
  assert.equal(restored.rooms[0].squareFeet, 100);
  assert.equal(restored.rooms[0].productionRate, 280);
});

test('an unrecognised upholstery name is normalised to the "other piece" empty name rather than leaking the crafted value', () => {
  const restored = decodeInputs('upholstery=Recliner:45');
  assert.equal(restored.upholstery.length, 1);
  assert.equal(restored.upholstery[0].name, '');
  assert.equal(restored.upholstery[0].minutes, 45);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('stairFlights=-5&hourlyWage=abc&burdenRate=30');
  assert.equal('stairFlights' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.burdenRate, 30);
});

test('a room or upholstery row with nothing usable in it is dropped rather than restored as a blank card', () => {
  assert.equal(decodeInputs('rooms=Attic::').rooms, undefined);
  assert.equal(decodeInputs('upholstery=Recliner:').upholstery, undefined);
});

test('multiple rooms and upholstery pieces are separated correctly, in order', () => {
  const encoded = encodeInputs({
    rooms: [
      { name: 'Bedroom', squareFeet: 120, productionRate: 280, petTreatment: false },
      { name: 'Office', squareFeet: 90, productionRate: 400, petTreatment: true },
    ],
    upholstery: [
      { name: 'Ottoman', minutes: 15 },
      { name: 'Loveseat', minutes: 50 },
    ],
  });
  const restored = decodeInputs(encoded);
  assert.deepEqual(restored.rooms.map((room) => room.name), ['Bedroom', 'Office']);
  assert.deepEqual(restored.upholstery.map((piece) => piece.name), ['Ottoman', 'Loveseat']);
  assert.equal(restored.rooms[1].petTreatment, true);
});

test('hash or query prefixes, an empty proposed price, and no rooms at all do not break the codec', () => {
  assert.equal(decodeInputs('#stairFlights=2').stairFlights, 2);
  assert.equal(decodeInputs('?hourlyWage=20').hourlyWage, 20);
  const encoded = encodeInputs({ proposedPrice: '', rooms: [], upholstery: [] });
  assert.equal(encoded, '');
  assert.deepEqual(decodeInputs(''), {});
});
