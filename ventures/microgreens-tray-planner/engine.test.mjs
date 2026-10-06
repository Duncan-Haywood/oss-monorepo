import test from "node:test";
import assert from "node:assert/strict";
import { computePlan, optimiseMix, splitTrays, summarize, money, DEFAULTS } from "./engine.mjs";

const one = (over = {}) => ({
  harvestDays: [2],
  rackTrays: 100,
  lossPct: 0,
  mediaPerTray: 0,
  packPerOz: 0,
  minutesPerTray: 0,
  wage: 0,
  fixedWeek: 0,
  crops: [{ name: "A", days: 7, ozPerTray: 10, pricePerOz: 2, seedPerTray: 1, trays: 10, maxTrays: 10 }],
  ...over,
});

test("splitTrays spreads whole trays evenly", () => {
  assert.deepEqual(splitTrays(10, 2), [5, 5]);
  assert.deepEqual(splitTrays(7, 3), [3, 2, 2]);
  assert.deepEqual(splitTrays(0, 2), [0, 0]);
});

test("a 7-day crop cut once a week holds one batch on every weekday", () => {
  const r = computePlan(one());
  assert.deepEqual(r.occupancy, Array(7).fill(10));
  assert.equal(r.peak, 10);
  assert.equal(r.batches[0].seedDow, 2);
});

test("seed day is the harvest day minus days to harvest, wrapping the week", () => {
  const r = computePlan(one({ crops: [{ name: "A", days: 10, ozPerTray: 1, pricePerOz: 1, seedPerTray: 0, trays: 4, maxTrays: 4 }], harvestDays: [2, 5] }));
  const days = r.batches.map((b) => [b.harvestDow, b.seedDow]).sort();
  assert.deepEqual(days, [[2, 6], [5, 2]]);
});

test("a crop longer than a week double-counts the overlapping days", () => {
  const r = computePlan(one({ crops: [{ name: "A", days: 10, ozPerTray: 1, pricePerOz: 1, seedPerTray: 0, trays: 3, maxTrays: 3 }] }));
  assert.equal(r.occupancy.reduce((a, b) => a + b, 0), 30);
  assert.equal(r.peak, 6);
});

test("money: revenue, cost, margin and hours", () => {
  const r = computePlan(one({ lossPct: 10, mediaPerTray: 0.5, packPerOz: 0.1, minutesPerTray: 30, wage: 20, fixedWeek: 20 }));
  // sold 9 oz -> $18 revenue per tray; cost 1 + 0.5 + 0.9 = 2.4
  assert.equal(Math.round(r.revenue * 100) / 100, 180);
  assert.equal(Math.round(r.variableCost * 100) / 100, 24);
  assert.equal(Math.round(r.margin * 100) / 100, 136);
  assert.equal(r.hours, 5);
  assert.equal(Math.round(r.afterWage * 100) / 100, 36);
});

test("a rack that is too small is reported with the shortfall", () => {
  const r = computePlan(one({ rackTrays: 8 }));
  assert.equal(r.fits, false);
  assert.equal(r.shortBy, 2);
});

test("optimiser fills the rack with the crop that earns most per rack-day and respects limits and peak", () => {
  const crops = [
    { name: "Slow", days: 14, ozPerTray: 10, pricePerOz: 3, seedPerTray: 1, trays: 0, maxTrays: 20 },
    { name: "Fast", days: 7, ozPerTray: 10, pricePerOz: 2, seedPerTray: 1, trays: 0, maxTrays: 6 },
  ];
  const o = one({ crops, harvestDays: [1, 4], rackTrays: 20 });
  const mix = optimiseMix(o);
  const r = computePlan({ ...o, crops: crops.map((c, i) => ({ ...c, trays: mix[i] })) });
  assert.ok(r.peak <= 20);
  assert.ok(mix[1] <= 6 && mix[0] <= 20);
  assert.equal(mix[1], 6, "the faster crop earns more per rack-day and is filled to its sell limit first");
});

test("the optimised mix never earns less than a feasible hand plan", () => {
  const r = computePlan({ ...DEFAULTS, rackTrays: 40, crops: DEFAULTS.crops.map((c) => ({ ...c, trays: 4 })) });
  assert.ok(r.fits);
  assert.ok(r.optimised.margin >= r.margin);
  assert.ok(r.optimised.peak <= 40);
});

test("defaults: 83 trays at the busiest weekday against 80 spaces", () => {
  const r = computePlan();
  assert.equal(r.peak, 83);
  assert.equal(r.shortBy, 3);
  assert.equal(r.ranking[0].name, "Pea shoots");
  assert.match(summarize(r).text, /3 short/);
});

test("bad input is named, not guessed", () => {
  assert.throws(() => computePlan({ harvestDays: [] }), /harvest day/);
  assert.throws(() => computePlan({ crops: [{ name: "A", days: 0, ozPerTray: 1, pricePerOz: 1, seedPerTray: 1, trays: 1 }] }), /days to harvest/);
  assert.throws(() => computePlan({ rackTrays: "" }), /Rack spaces/);
  assert.throws(() => computePlan({ lossPct: -1 }), /Loss/);
  assert.equal(money(-1.5), "-$1.50");
});
