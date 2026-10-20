import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeoffTotals, fromPreset, TAKEOFF_DEFAULTS } from './takeoff.mjs';
import { calculateBid } from './engine.mjs';

const close = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);

test('crew hours, crew size, setup and drive time add up to the labor the engine prices', () => {
  const t = takeoffTotals({
    items: [
      { label: 'Seal', unit: 'sq ft', qty: 1000, hoursPerUnit: 0.002, materialPerUnit: 0.1 },
      { label: 'Crack fill', unit: 'linear ft', qty: 80, hoursPerUnit: 0.0125, materialPerUnit: 0.5 },
    ],
    crewSize: 2, setupHours: 0.5, milesOneWay: 14, speedMph: 35,
  });
  close(t.workHours, 2 + 1);
  close(t.onSiteHours, 3.5);
  close(t.travelHours, 0.8);
  close(t.crewHours, 4.3);
  close(t.laborHours, 8.6);
  close(t.materials, 100 + 40);
  assert.equal(t.minimumApplied, false);
  assert.deepEqual(t.lead, { label: 'Seal', unit: 'sq ft', qty: 1000 });
});

test('a small job is charged the minimum on-site time, but an empty one is not', () => {
  const small = takeoffTotals({ items: [{ qty: 1, hoursPerUnit: 0.5, materialPerUnit: 0 }], minOnSiteHours: 2 });
  assert.equal(small.minimumApplied, true);
  close(small.onSiteHours, 2);
  const empty = takeoffTotals({ items: [{ qty: 0, hoursPerUnit: 0.5, materialPerUnit: 0 }], minOnSiteHours: 2 });
  assert.equal(empty.minimumApplied, false);
  close(empty.laborHours, 0);
});

test('bad input is named, not priced', () => {
  assert.throws(() => takeoffTotals({ items: [] }), /at least one line/);
  assert.throws(() => takeoffTotals({ items: [{ label: 'Tile', qty: -1, hoursPerUnit: 1 }] }), /Tile: quantity must be at least 0/);
  assert.throws(() => takeoffTotals({ items: [{ label: 'Tile', qty: '', hoursPerUnit: 1 }] }), /Tile: quantity is required/);
  assert.throws(() => takeoffTotals({ items: [{ qty: 1, hoursPerUnit: 1 }], crewSize: 0 }), /Crew size/);
  assert.throws(() => takeoffTotals({ items: [{ qty: 1, hoursPerUnit: 1 }], milesOneWay: 5, speedMph: 0 }), /Travel speed/);
});

test('fromPreset copies items and maps preset defaults onto the studio form', () => {
  const preset = {
    crewSize: 3, setupHours: 1, hourlyWage: 24, burdenRate: 18, overheadRate: 12, targetMargin: 35, tripFee: 40,
    items: [{ label: 'Room', unit: 'room', qty: 4, hoursPerUnit: 1.5, materialPerUnit: 20, source: 'x' }],
  };
  const { takeoff, form } = fromPreset(preset);
  assert.equal(takeoff.crewSize, 3);
  assert.equal(takeoff.setupHours, 1);
  assert.equal(takeoff.speedMph, TAKEOFF_DEFAULTS.speedMph);
  assert.deepEqual(form, { wage: 24, burdenPct: 18, overheadPct: 12, marginPct: 35, other: 40 });
  assert.equal(takeoff.items[0].source, undefined);
  takeoff.items[0].qty = 99;
  assert.equal(preset.items[0].qty, 4, 'editing the takeoff must not mutate the preset');
});

test('a preset wage of 0 (owner-operator) leaves the form wage alone', () => {
  const { form } = fromPreset({ hourlyWage: 0, targetMargin: 35, items: [{ label: 'x', unit: 'each', qty: 1, hoursPerUnit: 1, materialPerUnit: 0 }] });
  assert.deepEqual(form, { marginPct: 35 });
});

test('takeoff totals price through the studio engine the way a specialist would', () => {
  // 1,000 sq ft at 0.002 crew-h, crew of 2, $20/h + 25% burden, $100 sealer,
  // 10% overhead, 20% margin: labor 4 h x $25 = $100; direct $200; walk-away $220.
  const t = takeoffTotals({ items: [{ qty: 1000, hoursPerUnit: 0.002, materialPerUnit: 0.1 }], crewSize: 2 });
  const bid = calculateBid({ laborHours: t.laborHours, wage: 20, burdenPct: 25, materials: t.materials, overheadPct: 10, marginPct: 20 });
  assert.equal(bid.walkAway, 220);
  assert.equal(bid.price, 275);
});
