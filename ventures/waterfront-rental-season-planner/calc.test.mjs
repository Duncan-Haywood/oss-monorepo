import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, rentalsPerUnitDay, demandAt, season, breakEvenWeatherLoss, weatherSensitivity, optimizePrice, priceSteps, extraUnit, fleetSizes, wearPerSeason } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("num parses money and rejects junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("abc")));
});

test("rentals per unit-day: the last rental needs no turnaround", () => {
  // 9h = 540 min; 120 min rental + 15 turnaround: starts at 0,135,270,405 -> 4 (last ends at 525).
  assert.equal(rentalsPerUnitDay(2, 15, 9), 4);
  assert.equal(rentalsPerUnitDay(4, 30, 9), 2);
  assert.equal(rentalsPerUnitDay(10, 15, 9), 0);
  assert.equal(rentalsPerUnitDay(0, 15, 9), 0);
});

test("demand falls linearly with price and never goes negative", () => {
  close(demandAt(100, 40, 40, 0.8), 100);
  close(demandAt(100, 40, 44, 0.8), 92);
  assert.equal(demandAt(100, 40, 400, 0.8), 0);
});

test("sold is the smaller of demand and capacity; weekend turn-aways are counted", () => {
  const s = season(DEFAULTS);
  // 24 kayaks * 4 = 96/day capacity: weekday demand 22 and weekend 52 are both under it.
  assert.equal(s.paddle.capPerDay, 96);
  assert.equal(s.paddle.turnedAway, 0);
  // 3 boats * 2 = 6/day: weekday demand 2 fits, weekend demand 9 does not: 3 turned away per weekend day.
  assert.equal(s.boat.capPerDay, 6);
  close(s.boat.turnedAway, 3 * 110 * 0.82 * 0.3);
  const tight = season({ ...DEFAULTS, boatUnits: 2 });
  // 4/day capacity vs weekend demand 9: 5 turned away per weekend day.
  close(tight.boat.turnedAway, 5 * 110 * 0.82 * 0.3);
  assert.ok(tight.lostRevenue > 0);
});

test("open days shrink with weather; staff and rentals follow, the dock does not", () => {
  const a = season(DEFAULTS, 1, 0), b = season(DEFAULTS, 1, 50);
  close(b.openDays, a.openDays / 2);
  close(b.staff, a.staff / 2);
  assert.equal(b.fixed, a.fixed);
  close(b.revenue, a.revenue / 2);
});

test("hand-checked season: one paddle fleet, no boats, round numbers", () => {
  const o = { ...DEFAULTS, boatUnits: 0, boatWeekdayDemand: 0, boatWeekendDemand: 0, seasonDays: 100, weatherLossPct: 0, weekendSharePct: 50,
    paddleUnits: 10, paddleWeekdayDemand: 10, paddleWeekendDemand: 30, paddlePrice: 40, paddleCostPerRental: 2, feePct: 0,
    staffHourly: 20, openHours: 10, staffWeekday: 1, staffWeekend: 2, dockLeaseSeason: 1000, insuranceSeason: 500, marketingSeason: 0, permitsOtherSeason: 0, paddleUnitCost: 0 };
  const s = season(o);
  // 50 weekdays * 10 + 50 weekends * 30 = 2000 rentals * $40 = $80,000; costs: 2000*2 = 4000;
  // staff: 10h*$20*(50*1 + 50*2) = 30,000; fixed 1,500 -> cash profit 80,000 - 4,000 - 30,000 - 1,500 = 44,500.
  close(s.paddle.rentals, 2000);
  close(s.revenue, 80000);
  close(s.staff, 30000);
  close(s.cashProfit, 44500);
});

test("break-even weather loss makes cash profit zero", () => {
  const be = breakEvenWeatherLoss(DEFAULTS);
  assert.ok(be.possible && be.lossPct > DEFAULTS.weatherLossPct);
  assert.ok(Math.abs(season(DEFAULTS, 1, be.lossPct).cashProfit) < 1);
  const bad = breakEvenWeatherLoss({ ...DEFAULTS, dockLeaseSeason: 10_000_000 });
  assert.equal(bad.possible, false);
});

test("weather table is monotone: more lost days, less profit", () => {
  const rows = weatherSensitivity(DEFAULTS);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].cashProfit < rows[i - 1].cashProfit);
});

test("price search finds a finite best price at least as good as today's", () => {
  const o = optimizePrice(DEFAULTS);
  assert.ok(o.best.profit >= o.now.profit - 1e-6);
  assert.ok(o.best.mult >= 0.7 && o.best.mult <= 1.6);
  assert.ok(o.rows.length > 10);
  // With no sensitivity, the best price is the top of the range.
  assert.equal(optimizePrice({ ...DEFAULTS, priceSensitivity: 0 }).best.mult, 1.6);
});

test("price steps: the typed price row equals the season", () => {
  const row = priceSteps(DEFAULTS).find((r) => r.mult === 1);
  close(row.profit, season(DEFAULTS).profit);
});

test("an extra unit earns only from demand the fleet was turning away", () => {
  assert.equal(extraUnit(DEFAULTS, "paddle").gainCash, 0);
  const e = extraUnit(DEFAULTS, "boat");
  assert.ok(e.gainCash > 0);
  assert.ok(e.paybackSeasons > 0);
  close(e.paybackSeasons, e.cost / e.gainCash);
});

test("fleet size table includes the typed size and never goes below zero", () => {
  const rows = fleetSizes(DEFAULTS, "boat");
  assert.ok(rows.some((r) => r.units === DEFAULTS.boatUnits));
  assert.ok(rows.every((r) => r.units >= 0));
  close(rows.find((r) => r.units === DEFAULTS.boatUnits).profit, season(DEFAULTS).profit);
});

test("wear spreads cost less resale over the life", () => {
  const w = wearPerSeason({ ...DEFAULTS, paddleUnits: 10, paddleUnitCost: 1000, boatUnits: 0, boatUnitCost: 0, fleetLifeSeasons: 5, resalePct: 20 });
  close(w, (10 * 1000 * 0.8) / 5);
});

test("junk inputs produce numbers, not NaN", () => {
  const s = season({ ...DEFAULTS, seasonDays: NaN, paddleUnits: -3, openHours: undefined });
  for (const v of [s.revenue, s.profit, s.staff]) assert.ok(Number.isFinite(v));
});
