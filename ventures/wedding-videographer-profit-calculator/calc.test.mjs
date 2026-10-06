import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateBooking, deliverableLadder, minimumPrice, PRESETS, DEFAULT_LADDER } from "./calc.mjs";

const base = { price: 3000, shootHours: 8, highlightEditHours: 10, ceremonyEditHours: 5, speechesEditHours: 5, targetHourly: 50 };

test("true hourly is profit over every hour worked, not shoot hours", () => {
  const r = calculateBooking({ ...base, travelHours: 2, prepHours: 3, secondShooterHours: 8, secondShooterRate: 25, travelCost: 40,
    gearAnnualCost: 3000, bookingsPerYear: 30, deliveryCost: 10, processingPercent: 3 });
  assert.equal(r.hoursWorked, 8 + 2 + 3 + 20);
  // 3000 - 90 processing - 200 second - 40 travel - 100 gear - 10 delivery = 2560
  assert.equal(r.profit, 2560);
  assert.ok(Math.abs(r.trueHourly - 2560 / 33) < 1e-9);
  assert.equal(r.headlineHourly, 375);
});

test("revision cap: rounds past the cap cost hours and earn the extra fee", () => {
  const r = calculateBooking({ ...base, revisionRoundsIncluded: 2, revisionRoundsUsed: 5, hoursPerRevision: 2, extraRevisionFee: 150 });
  assert.equal(r.extraRounds, 3);
  assert.equal(r.revisionHours, 10);
  assert.equal(r.revisionRevenue, 450);
  assert.equal(r.revenue, 3450);
  assert.match(r.findings.map((f) => f.title).join("|"), /Revision creep: 3/);
  const unpaid = calculateBooking({ ...base, revisionRoundsIncluded: 2, revisionRoundsUsed: 5, hoursPerRevision: 2 });
  assert.match(unpaid.findings.map((f) => f.detail).join("|"), /unpaid/);
});

test("minimum price hits the target hourly exactly when re-run", () => {
  const input = { ...base, secondShooterHours: 8, secondShooterRate: 25, processingPercent: 3, deliveryCost: 20, travelHours: 1 };
  const r = calculateBooking(input);
  const again = calculateBooking({ ...input, price: r.minPrice });
  assert.ok(Math.abs(again.trueHourly - 50) < 1e-9);
});

test("edit-hour sensitivity lowers the rate and raises the minimum price", () => {
  const r = calculateBooking(base);
  const at = (m) => r.sensitivity.find((s) => s.multiplier === m);
  assert.equal(at(1).trueHourly, r.trueHourly);
  assert.ok(at(2).trueHourly < at(1.5).trueHourly && at(1.5).trueHourly < at(1).trueHourly && at(1).trueHourly < at(0.75).trueHourly);
  assert.ok(at(2).minPrice > at(1).minPrice);
  assert.equal(at(2).editHours, 40);
});

test("break-even edit hours is where the rate equals the target", () => {
  const r = calculateBooking(base);
  const scaled = calculateBooking({ ...base, highlightEditHours: r.breakEvenEditHours, ceremonyEditHours: 0, speechesEditHours: 0 });
  assert.ok(Math.abs(scaled.trueHourly - 50) < 1e-9);
  const none = calculateBooking({ ...base, targetHourly: 0 });
  assert.equal(none.breakEvenEditHours, null);
  assert.equal(none.minPrice, null);
});

test("edit-dominated bookings are flagged", () => {
  const r = calculateBooking({ ...base, highlightEditHours: 30, targetHourly: 80 });
  assert.ok(r.editShare > 0.5);
  assert.match(r.findings.map((f) => f.title).join("|"), /editing and revisions/);
  assert.match(r.findings[0].title, /below your/);
});

test("deliverable ladder compares tiers on the same costs", () => {
  const r = deliverableLadder({ ...base, shootHours: 8, targetHourly: 50 });
  assert.equal(r.rows.length, DEFAULT_LADDER.length);
  assert.equal(r.rows[0].hoursWorked, 16);
  assert.ok(r.best.trueHourly >= r.rows[0].trueHourly);
  assert.match(deliverableLadder(base, [DEFAULT_LADDER[0]]).error, /at least two/);
  assert.match(deliverableLadder(base, [{ price: "", editHours: 1 }, DEFAULT_LADDER[1]]).error, /price/);
});

test("validation errors come back as { error }", () => {
  assert.match(calculateBooking({ ...base, price: "" }).error, /Package price/);
  assert.match(calculateBooking({ ...base, price: 0 }).error, /greater than zero/);
  assert.match(calculateBooking({ ...base, shootHours: -1 }).error, /at least 0/);
  assert.match(calculateBooking({ ...base, processingPercent: 100 }).error, /at most/);
  assert.match(calculateBooking({ ...base, bookingsPerYear: 0 }).error, /at least 1/);
});

test("zero hours never divides by zero", () => {
  const r = calculateBooking({ price: 100, shootHours: 0 });
  assert.equal(r.trueHourly, null);
  assert.equal(r.headlineHourly, null);
  assert.ok(Number.isFinite(minimumPrice(r.input)));
});

test("presets are complete and run", () => {
  for (const p of PRESETS) {
    assert.ok(p.id && p.name);
    const r = calculateBooking({ ...p, targetHourly: 50 });
    assert.ok(!r.error, p.id);
  }
});
