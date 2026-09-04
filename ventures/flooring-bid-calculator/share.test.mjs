import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  rooms: [
    { name: 'Living room', material: 'LVP / vinyl plank (straight lay)', squareFeet: 280, wastePct: 8, installSqFtPerHour: 80, tearout: 'Carpet and pad', extra: 'drop-me' },
    { name: 'Kitchen', material: 'Ceramic tile (standard)', squareFeet: 180, wastePct: 12, installSqFtPerHour: 25, tearout: 'Ceramic tile' },
  ],
  materialCostPerSqFt: 2.4,
  underlaymentCostPerSqFt: 0.35,
  stairTreads: 13,
  hoursPerTread: 0.4,
  stairMaterialEach: 18,
  transitionCount: 6,
  hoursPerTransition: 0.15,
  transitionMaterialEach: 12,
  furnitureRooms: 2,
  hoursPerFurnitureRoom: 0.75,
  levelingSqFt: 80,
  hoursPer100Leveling: 0.8,
  levelingMaterialPerSqFt: 0.9,
  baseboardLf: 140,
  hoursPer100Baseboard: 1.2,
  baseboardMaterialPerLf: 1.1,
  hourlyWage: 28,
  burdenRate: 30,
  dumpFee: 85,
  travelCost: 40,
  otherCost: 0,
  overheadRate: 12,
  targetMargin: 25,
  proposedPrice: 4800,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every room, the material/tear-out choice, and the margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.rooms.length, 2);
  assert.equal(restored.rooms[0].name, 'Living room');
  assert.equal(restored.rooms[0].material, 'LVP / vinyl plank (straight lay)');
  assert.equal(restored.rooms[0].tearout, 'Carpet and pad');
  assert.equal(restored.rooms[1].material, 'Ceramic tile (standard)');
  assert.equal(restored.rooms[1].squareFeet, 180);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 4800);
  assert.equal(restored.stairTreads, 13);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.rooms[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    rooms: [{ name: 'x', squareFeet: 200, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.rooms[0].proto, undefined);
  assert.equal(restored.rooms[0].squareFeet, 200);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('a room with nothing usable is dropped rather than restored as an empty row', () => {
  const crafted = encodeURIComponent(JSON.stringify({ rooms: [{}, { name: 'ok', squareFeet: 5 }] }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.rooms.length, 1);
  assert.equal(restored.rooms[0].name, 'ok');
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['materialCostPerSqFt', 'stairTreads', 'levelingSqFt', 'targetMargin', 'proposedPrice', 'hourlyWage']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
