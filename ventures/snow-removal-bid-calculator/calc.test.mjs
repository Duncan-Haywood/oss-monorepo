import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSeason,
  SITE_PRESETS,
  ICE_MINUTE_FACTOR,
  ICE_SALT_FACTOR,
} from './calc.mjs';

const route = () => ({
  sites: [
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
  ],
  operatorWage: 22,
  burdenRate: 30,
  truckHourly: 45,
  deadheadMinutesPerSite: 6,
  saltCostPerBag: 8,
  overheadRate: 15,
  targetMargin: 20,
  expectedSnowEvents: 10,
  expectedIceEvents: 6,
  passesPerSnowEvent: 1,
});

test('route minutes include plow, sidewalk, and deadhead — not driveway count alone', () => {
  const result = calculateSeason(route());
  // 8 sites × (12 + 8 + 6) = 208 minutes
  assert.ok(Math.abs(result.plowMinutesPerPass - 208) < 1e-9);
  assert.ok(Math.abs(result.plowHoursPerPass - 208 / 60) < 1e-9);
  assert.equal(result.siteCount, 8);
});

test('a cheap seasonal that looked fine at eight storms is underwater at fourteen', () => {
  const eight = calculateSeason({ ...route(), expectedSnowEvents: 8, expectedIceEvents: 4 });
  const fourteen = calculateSeason({ ...route(), expectedSnowEvents: 14, expectedIceEvents: 8 });
  // Same route, same per-event cost — only the winter length changed.
  assert.ok(Math.abs(eight.costPerSnowEvent - fourteen.costPerSnowEvent) < 1e-9);
  assert.ok(fourteen.seasonalCost > eight.seasonalCost * 1.5);

  // $350/driveway × 8 stops = $2,800. It "sounds like a lot" to the
  // homeowner and still loses a quiet eight-storm winter.
  const cheap = 2800;
  const shortCheap = calculateSeason({ ...route(), expectedSnowEvents: 8, expectedIceEvents: 4, proposedSeasonal: cheap });
  assert.equal(shortCheap.proposedSeasonal.belowBreakEven, true);

  // $625/driveway × 8 = $5,000 covers the quiet winter and loses the long one.
  const mid = 5000;
  const short = calculateSeason({ ...route(), expectedSnowEvents: 8, expectedIceEvents: 4, proposedSeasonal: mid });
  const long = calculateSeason({ ...route(), expectedSnowEvents: 14, expectedIceEvents: 8, proposedSeasonal: mid });
  assert.equal(short.proposedSeasonal.belowBreakEven, false);
  assert.equal(long.proposedSeasonal.belowBreakEven, true);
  assert.ok(long.proposedSeasonal.profit < 0);
});

test('price stacks burden, truck, salt, overhead, then margin as a share of price', () => {
  const result = calculateSeason(route());
  assert.equal(result.loadedHourly, 22 * 1.3 + 45);
  assert.ok(Math.abs(result.saltBagsPerPass - 12) < 1e-9);
  assert.ok(Math.abs(result.saltPerPass - 96) < 1e-9);

  const labor = result.plowHoursPerPass * result.loadedHourly;
  assert.ok(Math.abs(result.laborEquipPerPass - labor) < 1e-9);
  const direct = labor + 96;
  assert.ok(Math.abs(result.overheadPerPass - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.costPerPass - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.seasonalProfit / result.seasonalPrice * 100 - 20) < 1e-9);
});

test('ice events are priced separately and can sink an unlimited-ice seasonal', () => {
  const noIce = calculateSeason({ ...route(), expectedIceEvents: 0 });
  const withIce = calculateSeason(route());
  assert.ok(withIce.seasonalCost > noIce.seasonalCost);
  assert.ok(withIce.costPerIceEvent > 0);

  // Default ice minutes = (plow + sidewalk) * 0.65, plus the same deadhead.
  const one = calculateSeason({
    ...route(),
    sites: [{ name: 'Drive', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 }],
  });
  assert.ok(Math.abs(one.sites[0].iceMinutes - 20 * ICE_MINUTE_FACTOR) < 1e-9);
  assert.ok(Math.abs(one.sites[0].iceSaltBags - 1.5 * ICE_SALT_FACTOR) < 1e-9);
});

test('a second pass on a long storm scales snow cost without touching ice', () => {
  const one = calculateSeason(route());
  const two = calculateSeason({ ...route(), passesPerSnowEvent: 2 });
  assert.ok(Math.abs(two.costPerSnowEvent - one.costPerSnowEvent * 2) < 1e-9);
  assert.ok(Math.abs(two.costPerIceEvent - one.costPerIceEvent) < 1e-9);
  assert.ok(Math.abs(two.snowHoursPerEvent - one.snowHoursPerEvent * 2) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateSeason({ ...route(), targetMargin: 0 });
  assert.ok(Math.abs(result.seasonalPrice - result.seasonalCost) < 1e-9);
  assert.ok(Math.abs(result.pricePerPush - result.costPerSnowEvent) < 1e-9);
  assert.ok(Math.abs(result.seasonalProfit) < 1e-9);
});

test('a proposed seasonal is scored against the same winter cost', () => {
  const bid = calculateSeason(route());
  const scored = calculateSeason({ ...route(), proposedSeasonal: bid.seasonalPrice });
  assert.ok(Math.abs(scored.proposedSeasonal.margin - 20) < 1e-9);
  assert.equal(scored.proposedSeasonal.belowBreakEven, false);
});

test('a proposed per-push under cost is flagged as a losing visit', () => {
  const bid = calculateSeason(route());
  const scored = calculateSeason({ ...route(), proposedPerPush: bid.costPerSnowEvent - 25 });
  assert.equal(scored.proposedPerPush.belowBreakEven, true);
  assert.ok(scored.proposedPerPush.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateSeason(route()).proposedSeasonal, null);
  assert.equal(calculateSeason(route()).proposedPerPush, null);
  assert.equal(calculateSeason({ ...route(), proposedSeasonal: '' }).proposedSeasonal, null);
  assert.equal(calculateSeason({ ...route(), proposedPerPush: null }).proposedPerPush, null);
  assert.equal(calculateSeason({ ...route(), proposedSeasonal: 0 }).proposedSeasonal.price, 0);
});

test('break-even storm count is how a cheap seasonal dies', () => {
  const bid = calculateSeason(route());
  // Target-margin price includes a buffer: the quote stays profitable past
  // the entered 10 storms. The buffer is the whole point of quoting margin.
  assert.ok(bid.breakEvenSnowEvents > 10);
  assert.ok(bid.breakEvenSnowEvents < 16);

  const atCost = calculateSeason({ ...route(), proposedSeasonal: bid.seasonalCost });
  // At walk-away, after ice is paid, remaining budget covers exactly the
  // entered snow events — one more storm and the winter loses money.
  assert.ok(Math.abs(atCost.proposedSeasonal.breakEvenSnowEvents - 10) < 1e-6);
  assert.equal(atCost.walkAwaySeasonal, atCost.seasonalCost);
});

test('an ice-only route (zero plow cost) reports an unbounded break-even, not a crash', () => {
  // A site that is salt/ice-only has no plow minutes and no deadhead, so
  // costPerSnowEvent lands on exactly 0 — snow-event count no longer bounds
  // the seasonal at all, only ice does. calculateSeason must say "null"
  // (unbounded) here rather than dividing by zero, and it must say so both
  // at the top level and inside the proposedSeasonal view the page renders.
  const iceOnly = {
    sites: [{ name: 'Salt-only stop', minutesPerPush: 0, sidewalkMinutes: 0, saltBags: 0 }],
    operatorWage: 22,
    burdenRate: 30,
    truckHourly: 45,
    deadheadMinutesPerSite: 0,
    saltCostPerBag: 8,
    overheadRate: 15,
    targetMargin: 20,
    expectedSnowEvents: 10,
    expectedIceEvents: 6,
    passesPerSnowEvent: 1,
    proposedSeasonal: 500,
  };
  const result = calculateSeason(iceOnly);
  assert.equal(result.costPerSnowEvent, 0);
  assert.equal(result.breakEvenSnowEvents, null);
  assert.ok(result.proposedSeasonal, 'proposedSeasonal view must still be built');
  assert.equal(result.proposedSeasonal.breakEvenSnowEvents, null);
});

test('a nameless site still reports under a stable label', () => {
  const result = calculateSeason({
    ...route(),
    sites: [
      { minutesPerPush: 10, sidewalkMinutes: 0, saltBags: 1 },
      { name: '   ', minutesPerPush: 10, sidewalkMinutes: 0, saltBags: 1 },
    ],
  });
  assert.equal(result.sites[0].name, 'Site 1');
  assert.equal(result.sites[1].name, 'Site 2');
});

test('an empty winter still reports a walk-away of zero rather than dividing by zero', () => {
  const result = calculateSeason({
    ...route(),
    expectedSnowEvents: 0,
    expectedIceEvents: 0,
  });
  assert.equal(result.seasonalCost, 0);
  assert.equal(result.seasonalPrice, 0);
  assert.equal(result.effectiveHourlyRate, null);
  assert.ok(result.costPerSnowEvent > 0);
  assert.ok(result.pricePerPush > 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateSeason({ ...route(), sites: [] }), /at least one site/);
  assert.throws(() => calculateSeason({ ...route(), operatorWage: 'abc' }), /Operator wage must be a number/);
  assert.throws(() => calculateSeason({ ...route(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateSeason({ ...route(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => calculateSeason({ ...route(), passesPerSnowEvent: 0 }), /greater than zero/);
  assert.throws(
    () => calculateSeason({
      ...route(),
      sites: [{ name: 'Lot', minutesPerPush: -2, sidewalkMinutes: 0, saltBags: 0 }],
    }),
    /Lot: plow minutes must be at least 0/,
  );
});

test('site presets are usable positive numbers', () => {
  assert.ok(SITE_PRESETS.length >= 7);
  for (const preset of SITE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.minutesPerPush) && preset.minutesPerPush > 0);
    assert.ok(Number.isFinite(preset.sidewalkMinutes) && preset.sidewalkMinutes >= 0);
    assert.ok(Number.isFinite(preset.saltBags) && preset.saltBags >= 0);
  }
});

test('per-site seasonal and per-push quotes divide the route, not hide it', () => {
  const result = calculateSeason(route());
  assert.ok(Math.abs(result.pricePerSiteSeasonal * 8 - result.seasonalPrice) < 1e-9);
  assert.ok(Math.abs(result.pricePerSitePerPush * 8 - result.pricePerPush) < 1e-9);
});
