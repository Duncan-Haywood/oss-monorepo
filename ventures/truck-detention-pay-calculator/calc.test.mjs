import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDetention, stopDetention, claimText, hoursText } from "./calc.mjs";

const base = { freeHours: 2, incrementMinutes: 30, ratePerHour: 50, capHours: 0 };
const opts = { freeMinutes: 120, incrementMinutes: 30, ratePerHour: 50, capHours: 0 };

test("time inside free time bills nothing", () => {
  const r = stopDetention({ arrival: "2026-10-05T08:00", departure: "2026-10-05T09:45" }, opts);
  assert.equal(r.amount, 0);
});

test("time past free time rounds UP to the billing increment", () => {
  // 3h10m on the clock, 2h free -> 70 min beyond -> 90 min billed at 30-min increments = 1.5h
  const r = stopDetention({ arrival: "2026-10-05T08:00", departure: "2026-10-05T11:10" }, opts);
  assert.equal(r.billableHours, 1.5);
  assert.equal(r.amount, 75);
});

test("hourly increment rounds 70 minutes up to a full hour... of two", () => {
  const r = stopDetention({ arrival: "2026-10-05T08:00", departure: "2026-10-05T11:10" }, { ...opts, incrementMinutes: 60 });
  assert.equal(r.billableHours, 2);
});

test("clock starts at the appointment when the driver arrived early", () => {
  // arrived 06:00, appt 08:00, left 11:00: clock = 3h, not 5h
  const r = stopDetention({ arrival: "2026-10-05T06:00", appointment: "2026-10-05T08:00", departure: "2026-10-05T11:00" }, opts);
  assert.equal(r.clockMinutes, 180);
  assert.equal(r.arrivedEarlyMinutes, 120);
  assert.equal(r.billableHours, 1);
});

test("a late arrival starts the clock at arrival, not the appointment", () => {
  const r = stopDetention({ arrival: "2026-10-05T09:00", appointment: "2026-10-05T08:00", departure: "2026-10-05T12:00" }, opts);
  assert.equal(r.clockMinutes, 180);
});

test("a cap limits billable hours and is flagged", () => {
  const r = stopDetention({ arrival: "2026-10-05T08:00", departure: "2026-10-05T18:00" }, { ...opts, capHours: 4 });
  assert.equal(r.billableHours, 4);
  assert.equal(r.capped, true);
});

test("overnight stays cross midnight correctly", () => {
  const r = stopDetention({ arrival: "2026-10-05T22:00", departure: "2026-10-06T03:00" }, opts);
  assert.equal(r.onSiteMinutes, 300);
  assert.equal(r.billableHours, 3);
});

test("totals two stops and shows hourly pay with and without the claim", () => {
  const r = calculateDetention({
    ...base, linehaul: 1200, driveHours: 8,
    stops: [
      { name: "Pickup", arrival: "2026-10-05T08:00", departure: "2026-10-05T12:00" },
      { name: "Delivery", arrival: "2026-10-06T08:00", departure: "2026-10-06T09:00" },
    ],
  });
  assert.equal(r.total, 100); // pickup 4h clock - 2h free = 2h x $50
  assert.equal(r.stops.length, 2);
  assert.equal(r.hourlyUnpaid, 92.31); // 8 drive + 4 + 1 on site = 13h
  assert.equal(r.hourlyPaid, Math.round((1300 / 13) * 100) / 100);
});

test("rejects bad input instead of guessing", () => {
  assert.match(calculateDetention({ ...base, ratePerHour: 0, stops: [] }).error, /rate/);
  assert.match(calculateDetention({ ...base, stops: [] }).error, /at least one stop/);
  assert.match(calculateDetention({ ...base, incrementMinutes: 20, stops: [] }).error, /increment/);
  assert.match(calculateDetention({ ...base, freeHours: -1, stops: [] }).error, /freeHours/);
  assert.match(calculateDetention({ ...base, stops: [{ arrival: "2026-10-05T10:00", departure: "2026-10-05T09:00" }] }).error, /after arrival/);
  assert.match(calculateDetention({ ...base, stops: [{ arrival: "garbage", departure: "2026-10-05T09:00" }] }).error, /date-time/);
});

test("claim text names only stops with money owed and the total", () => {
  const r = calculateDetention({
    ...base,
    stops: [
      { name: "Pickup", arrival: "2026-10-05T08:00", departure: "2026-10-05T12:00" },
      { name: "Delivery", arrival: "2026-10-06T08:00", departure: "2026-10-06T08:30" },
    ],
  });
  const t = claimText(r, { loadNumber: "L-123" });
  assert.match(t, /load L-123/);
  assert.match(t, /Pickup: 4h 00m on the clock/);
  assert.doesNotMatch(t, /Delivery/);
  assert.match(t, /Total detention: \$100\.00/);
});

test("yearly figure scales one load's claim by loads per month", () => {
  const r = calculateDetention({ ...base, detentionLoadsPerMonth: 4, stops: [{ arrival: "2026-10-05T08:00", departure: "2026-10-05T12:00" }] });
  assert.equal(r.yearly, 100 * 4 * 12);
});

test("hoursText formats minutes", () => assert.equal(hoursText(125), "2h 05m"));
