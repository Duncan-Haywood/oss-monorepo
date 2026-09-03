import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COST_IDS, encodeState, decodeState } from './share.mjs';

const sample = {
  costs: {
    hourlyWage: 25,
    burdenRate: 25,
    prepHours: 6,
    setupHours: 2,
    paintPrice: 45,
    paintCoverage: 350,
    wastePercent: 10,
    travelCost: 40,
    otherCost: 35,
    overheadRate: 15,
    targetMargin: 25,
    floorSquareFeet: 1200,
    commonFloorBid: 2,
    extraCoatFactor: 0.65,
    ceilingHeightFeet: 8,
  },
  surfaces: [
    { type: 'walls', quantity: 2400, productionRate: 200, coats: 2 },
    { type: 'trim', quantity: 320, productionRate: 50, coats: 2 },
  ],
};

test('encode then decode returns the same known numeric fields and surfaces', () => {
  const roundTrip = decodeState(encodeState(sample));
  assert.deepEqual(roundTrip.costs, sample.costs);
  assert.deepEqual(roundTrip.surfaces, sample.surfaces);
});

test('the same inputs always encode to the same string', () => {
  assert.equal(encodeState(sample), encodeState({ ...sample, costs: { ...sample.costs } }));
});

test('unknown, blank, and negative fields never survive a decode', () => {
  const decoded = decodeState('hourlyWage=25&secret=99&prepHours=&travelCost=-4&s0=walls,2400,200,2&s1=madeup,10,1,1&s2=trim,80,40,1.5');
  assert.deepEqual(decoded.costs, { hourlyWage: 25 });
  assert.deepEqual(decoded.surfaces, [
    { type: 'walls', quantity: 2400, productionRate: 200, coats: 2 },
  ]);
});

test('a leading ? or # is accepted so callers can pass location.search or hash', () => {
  const encoded = encodeState(sample);
  assert.deepEqual(decodeState(`?${encoded}`), decodeState(encoded));
  assert.deepEqual(decodeState(`#${encoded}`), decodeState(encoded));
});

test('COST_IDS is the allowlist the encoder emits', () => {
  const params = new URLSearchParams(encodeState({
    costs: Object.fromEntries(COST_IDS.map((id, i) => [id, i + 1])),
    surfaces: [],
  }));
  assert.deepEqual([...params.keys()].sort(), [...COST_IDS].sort());
});

test('empty or non-string sources decode to empty state rather than throwing', () => {
  assert.deepEqual(decodeState(''), { costs: {}, surfaces: [] });
  assert.deepEqual(decodeState(null), { costs: {}, surfaces: [] });
});
