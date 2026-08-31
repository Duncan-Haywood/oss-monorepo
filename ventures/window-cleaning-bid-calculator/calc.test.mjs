import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, PANE_PRESETS } from './calc.mjs';

const storefront = () => ({
  groups: [
    { name: 'Ground-floor exterior (water-fed pole)', panes: 30, minutesPerPane: 1.5, sides: 1 },
    { name: 'French / divided-light pane', panes: 10, minutesPerPane: 4, sides: 2 },
    { name: 'Storefront plate glass', panes: 6, minutesPerPane: 8, sides: 1 },
  ],
  hourlyWage: 20,
  burdenRate: 25,
  travelSetupMinutes: 25,
  suppliesPerVisit: 8,
  otherPerVisit: 12,
  overheadRate: 15,
  targetMargin: 20,
  minimumCharge: 0,
  visitsPerMonth: 4,
});

test('visit hours are panes × minutes × sides, plus travel that does not shrink', () => {
  const result = calculateBid(storefront());
  // 30*1.5 + 10*4*2 + 6*8 = 45 + 80 + 48 = 173 pane minutes; +25 travel = 198
  assert.ok(Math.abs(result.paneMinutes - 173) < 1e-9);
  assert.ok(Math.abs(result.hoursPerVisit - 198 / 60) < 1e-9);
  assert.ok(Math.abs(result.travelHours - 25 / 60) < 1e-9);
  assert.equal(result.totalPanes, 46);
  assert.equal(result.totalPaneSides, 56);
});

test('French panes consume labor out of all proportion to their pane count', () => {
  const result = calculateBid(storefront());
  const french = result.groups.find(g => g.name.startsWith('French'));
  const paneShare = french.panes / result.totalPanes * 100;
  assert.ok(paneShare < 25, `French panes are ${paneShare.toFixed(1)}% of the panes`);
  assert.ok(french.hoursShare > 40, `but only ${french.hoursShare.toFixed(1)}% of the pane labor`);
});

test('travel is a first-class share of a small stop, not a rounding error', () => {
  const tiny = calculateBid({
    ...storefront(),
    groups: [{ name: 'Ground-floor exterior (water-fed pole)', panes: 8, minutesPerPane: 1.5, sides: 1 }],
    travelSetupMinutes: 35,
    visitsPerMonth: 0,
  });
  // 12 pane minutes vs 35 travel — most of the visit is the drive.
  assert.ok(tiny.travelShare > 70);
  assert.ok(tiny.travelHours > tiny.paneHours);
});

test('price stacks burden, visit costs, overhead, then margin as a share of price', () => {
  const result = calculateBid(storefront());
  assert.equal(result.loadedWage, 20 * 1.25);

  const direct = result.laborPerVisit + 8 + 12;
  assert.ok(Math.abs(result.overheadPerVisit - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.costPerVisit - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profitPerVisit / result.pricePerVisit * 100 - 20) < 1e-9);
  assert.ok(Math.abs(result.monthlyPrice - result.pricePerVisit * 4) < 1e-9);
});

test('a minimum job charge lifts a small stop without changing the cost base', () => {
  const raw = calculateBid({ ...storefront(), visitsPerMonth: 0, minimumCharge: 0 });
  const floored = calculateBid({ ...storefront(), visitsPerMonth: 0, minimumCharge: raw.pricePerVisit + 40 });
  assert.equal(floored.minimumApplied, true);
  assert.ok(Math.abs(floored.pricePerVisit - (raw.pricePerVisit + 40)) < 1e-9);
  assert.ok(Math.abs(floored.costPerVisit - raw.costPerVisit) < 1e-9);
  assert.ok(floored.profitPerVisit > raw.profitPerVisit);
});

test('a zero-margin bid with no minimum prices at cost', () => {
  const result = calculateBid({ ...storefront(), targetMargin: 0, minimumCharge: 0 });
  assert.ok(Math.abs(result.pricePerVisit - result.costPerVisit) < 1e-9);
  assert.ok(Math.abs(result.profitPerVisit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(storefront());
  const scored = calculateBid({ ...storefront(), proposedPrice: bid.pricePerVisit });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(storefront());
  const scored = calculateBid({ ...storefront(), proposedPrice: bid.costPerVisit - 25 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(storefront()).proposed, null);
  assert.equal(calculateBid({ ...storefront(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...storefront(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...storefront(), proposedPrice: 0 }).proposed.price, 0);
});

test('visits per month scale the monthly figures and never the one-visit hours', () => {
  const weekly = calculateBid(storefront());
  const oneOff = calculateBid({ ...storefront(), visitsPerMonth: 0 });
  assert.equal(oneOff.hoursPerVisit, weekly.hoursPerVisit);
  assert.equal(oneOff.monthlyPrice, 0);
  assert.equal(oneOff.monthlyHours, 0);
  assert.ok(Math.abs(weekly.monthlyHours - weekly.hoursPerVisit * 4) < 1e-9);
});

test('a nameless group still reports under a stable label', () => {
  const result = calculateBid({
    ...storefront(),
    groups: [
      { panes: 4, minutesPerPane: 2, sides: 1 },
      { name: '   ', panes: 2, minutesPerPane: 2, sides: 1 },
    ],
  });
  assert.equal(result.groups[0].name, 'Group 1');
  assert.equal(result.groups[1].name, 'Group 2');
});

test('a stop with no panes still prices travel, supplies, and the minimum', () => {
  const result = calculateBid({
    ...storefront(),
    groups: [{ name: 'Empty', panes: 0, minutesPerPane: 1.5, sides: 1 }],
    travelSetupMinutes: 40,
    minimumCharge: 125,
    visitsPerMonth: 0,
  });
  assert.equal(result.paneHours, 0);
  assert.equal(result.pricePerPane, null);
  assert.ok(result.hoursPerVisit > 0);
  assert.equal(result.minimumApplied, true);
  assert.equal(result.pricePerVisit, 125);
  assert.equal(result.groups[0].hoursShare, 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...storefront(), groups: [] }), /at least one pane group/);
  assert.throws(
    () => calculateBid({ ...storefront(), groups: [{ name: 'Lobby', panes: 4, minutesPerPane: 0, sides: 1 }] }),
    /Lobby: minutes per pane must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({ ...storefront(), groups: [{ name: 'Lobby', panes: -2, minutesPerPane: 2, sides: 1 }] }),
    /Lobby: pane count must be at least 0/,
  );
  assert.throws(
    () => calculateBid({ ...storefront(), groups: [{ name: 'Lobby', panes: 4, minutesPerPane: 2, sides: 3 }] }),
    /Lobby: sides must be 1 or 2/,
  );
  assert.throws(() => calculateBid({ ...storefront(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...storefront(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...storefront(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('pane presets are usable positive numbers with 1 or 2 default sides', () => {
  assert.ok(PANE_PRESETS.length >= 8);
  for (const preset of PANE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.minutesPerPane) && preset.minutesPerPane > 0);
    assert.ok(preset.defaultSides === 1 || preset.defaultSides === 2);
  }
});
