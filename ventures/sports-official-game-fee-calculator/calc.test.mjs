import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, trip, season, gamesForTarget, minFee, validate, sampleInput, toCsv, usd } from "./calc.mjs";

const base = { fee: 100, assignorPct: 10, gamesPerTrip: 1, miles: 20, mph: 40, costPerMile: 0.5, irsRate: 0.7, tripExpense: 5, hoursFirst: 2, hoursExtra: 1,
  games: 40, annualCosts: 400, taxPct: 10, targetHourly: 30, targetTakeHome: 2000 };

test("hand-computed trip: $75 net over 2.5 hours is $30 an hour", () => {
  const t = trip(validate(base));
  assert.equal(t.gross, 100);
  assert.equal(t.assignor, 10);
  assert.equal(t.driving, 10);
  assert.equal(t.net, 75);
  assert.equal(t.driveHours, 0.5);
  assert.equal(t.hours, 2.5);
  assert.equal(t.hourly, 30);
});

test("a second game on the same trip pays the drive once", () => {
  const v = validate({ ...base, gamesPerTrip: 2 });
  const t = trip(v);
  assert.equal(t.net, 200 - 20 - 10 - 5);
  assert.equal(t.hours, 3.5);
  assert.ok(t.hourly > trip(validate(base)).hourly);
});

test("season: tax view uses the IRS rate, cash view uses real cost", () => {
  const s = season(validate(base));
  assert.equal(s.trips, 40);
  assert.equal(s.cashBeforeTax, 4000 - 400 - 400 - 200 - 400);
  assert.equal(s.mileageDeduction, 40 * 20 * 0.7);
  assert.equal(s.profit, 4000 - 400 - 560 - 200 - 400);
  assert.ok(Math.abs(s.se - 2440 * 0.9235 * 0.153) < 1e-9);
  assert.ok(Math.abs(s.incomeTax - (2440 - s.se / 2) * 0.1) < 1e-9);
  assert.ok(Math.abs(s.takeHome - (s.cashBeforeTax - s.se - s.incomeTax)) < 1e-9);
});

test("no tax is charged on a loss", () => {
  const s = season(validate({ ...base, fee: 5, annualCosts: 2000 }));
  assert.ok(s.profit < 0);
  assert.equal(s.se, 0);
  assert.equal(s.incomeTax, 0);
});

test("games needed to reach a take-home target is the first count that clears it", () => {
  const v = validate(base);
  const g = gamesForTarget(v, 2000);
  assert.ok(season(v, g).takeHome >= 2000);
  assert.ok(season(v, g - 1).takeHome < 2000);
  assert.equal(gamesForTarget(validate({ ...base, fee: 1 }), 1e9), null);
});

test("minimum fee reproduces the target hourly rate", () => {
  const v = validate(base);
  const f = minFee(v, 30);
  const t = trip({ ...v, fee: f });
  assert.ok(Math.abs(t.hourly - 30) < 1e-9);
});

test("distance ladder falls as miles rise, and flags your own distance", () => {
  const r = plan(base);
  for (let i = 1; i < r.byDistance.length; i++) assert.ok(r.byDistance[i].hourly <= r.byDistance[i - 1].hourly);
  assert.equal(r.byDistance.filter((l) => l.isYours).length, 1);
  assert.equal(r.byGames.filter((l) => l.isYours).length, 1);
});

test("validation rejects bad input with a readable message", () => {
  assert.match(plan({ ...base, fee: "" }).error, /fee/);
  assert.match(plan({ ...base, assignorPct: 60 }).error, /Assignor/);
  assert.match(plan({ ...base, hoursFirst: 0 }).error, /hours/);
  assert.match(plan({ ...base, miles: -1 }).error, /negative/);
});

test("sample input plans cleanly and the CSV has a header plus one row per distance", () => {
  const r = plan(sampleInput());
  assert.ok(!r.error);
  assert.ok(r.advice.length > 0);
  assert.equal(toCsv(r).trim().split("\n").length, r.byDistance.length + 1);
  assert.equal(usd(-3.456), "-$3.46");
});
