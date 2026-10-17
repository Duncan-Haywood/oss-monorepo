import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, floorFee, quote, bookingsNeeded, effectiveCommission, hoursPerBooking, num, toCsv } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("effective commission is rate x share of bookings through a bureau", () => {
  near(effectiveCommission(DEFAULTS), 0.1);
});

test("floor fee: (goal + overhead)/bookings, travel absorbed only when speaker pays, grossed up for commission", () => {
  near(floorFee(DEFAULTS), (168000 / 24) / 0.9); // client pays travel
  near(floorFee({ ...DEFAULTS, travelPaidBy: 1 }), (168000 / 24 + 900) / 0.9);
  near(floorFee({ ...DEFAULTS, commissionPct: 0 }), 7000);
});

test("a booking at the floor fee, no add-ons, nets the per-booking goal on average", () => {
  const o = { ...DEFAULTS, marketFee: floorFee(DEFAULTS) };
  const n = bookingsNeeded(o, o.marketFee);
  near(n, 24, 1e-6);
});

test("quote stacks add-ons: percentages on base, rush on the subtotal", () => {
  const q = quote(DEFAULTS, { customContent: true, workshop: true, recording: true, rush: true });
  const subtotal = 7500 + 7500 * 0.15 + 2500 + 7500 * 0.25;
  near(q.fee, subtotal * 1.2);
  assert.equal(q.lines.length, 5);
});

test("bureau commission is on the whole fee; direct bookings pay none", () => {
  near(quote(DEFAULTS, {}).commission, 1500);
  assert.equal(quote(DEFAULTS, { bureau: false }).commission, 0);
});

test("travel: client reimburses on top by default, or the speaker pays out of the fee", () => {
  const client = quote(DEFAULTS, {});
  near(client.net, 7500 - 1500);
  near(client.clientTotal, 8400);
  const self = quote({ ...DEFAULTS, travelPaidBy: 1 }, {});
  near(self.net, 7500 - 1500 - 900);
  near(self.clientTotal, 7500);
});

test("virtual discounts the fee and removes travel time and cost", () => {
  const v = quote(DEFAULTS, { virtual: true });
  near(v.fee, 4500);
  assert.equal(v.travelOut, 0);
  near(v.hours, DEFAULTS.prepHours + DEFAULTS.eventHours);
});

test("hours per booking counts prep, event and travel days", () => {
  near(hoursPerBooking(DEFAULTS), 12 + 2 + 8);
});

test("net per hour occupied divides net by the booking's hours", () => {
  const q = quote(DEFAULTS, {});
  near(q.netPerHour, 6000 / 22);
});

test("a market fee below the floor warns with the shortfall", () => {
  const a = analyze({ ...DEFAULTS, marketFee: 4000 });
  assert.ok(a.warnings.some((w) => /short of/.test(w)));
  assert.ok(a.gap < 0);
});

test("bookings needed beyond a 2,000-hour year warns", () => {
  const a = analyze({ ...DEFAULTS, marketFee: 2000 });
  assert.ok(a.warnings.some((w) => /2,000-hour/.test(w)));
});

test("ladder: doubling the fee halves the bookings needed when nothing else changes", () => {
  const o = { ...DEFAULTS, commissionPct: 0, travelPaidBy: 0 };
  const a = analyze(o);
  const one = a.ladder.find((l) => l.multiplier === 1);
  const two = a.ladder.find((l) => l.multiplier === 2);
  near(one.bookings / two.bookings, 2, 1e-9);
});

test("invalid inputs return warnings, no result", () => {
  const a = analyze({ ...DEFAULTS, bookingsPerYear: 0 });
  assert.equal(a.result, null);
  assert.ok(a.warnings.length);
  assert.equal(analyze({ ...DEFAULTS, commissionPct: 95 }).result, null);
});

test("num parses typed money and rejects empty", () => {
  assert.equal(num("$7,500"), 7500);
  assert.ok(Number.isNaN(num("")));
});

test("csv has a header and the floor", () => {
  const csv = toCsv(analyze(DEFAULTS));
  assert.match(csv, /^item,usd/);
  assert.match(csv, /fee_floor_for_goal,/);
});
