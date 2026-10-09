import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_DEFAULTS, SHARED_DEFAULTS, num, money, overheadPerHour, serviceEconomics, priceForTarget, breakEvenBookings, capacityBookings, analyzeService, compare, toCsv, readShared } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Round numbers: $100, 60 min chair + 0 set-up, no supplies, no card fee, no no-shows, no studio costs.
const plain = { ...SERVICE_DEFAULTS, price: 100, apptMin: 60, setupMin: 0, supplies: 0, noShowPct: 0, depositKept: 0, visits: 1 };
const free = { ...SHARED_DEFAULTS, chairHours: 100, utilPct: 100, rent: 0, otherMonthly: 0, cardPct: 0, cardFixed: 0, targetHourly: 40 };

test("num strips money and percent signs", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("12%"), 12);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("with no costs the take-home is the price over the chair hours", () => {
  const e = serviceEconomics(plain, free);
  near(e.contribution, 100);
  near(e.takeHomePerHour, 100);
  near(e.menuHourly, 100);
});

test("set-up minutes count as chair time but not as menu time", () => {
  const e = serviceEconomics({ ...plain, setupMin: 20 }, free);
  near(e.hours, 80 / 60);
  near(e.takeHomePerHour, 100 / (80 / 60));
  near(e.menuHourly, 100);
});

test("supplies and card fees come off every booking", () => {
  const e = serviceEconomics({ ...plain, supplies: 10 }, { ...free, cardPct: 3, cardFixed: 0.5 });
  near(e.cardFee, 3.5);
  near(e.contribution, 100 - 3.5 - 10);
});

test("a no-show keeps only the deposit, pays no card fee on the price, and still blocks the slot", () => {
  const e = serviceEconomics({ ...plain, noShowPct: 20, depositKept: 25 }, { ...free, cardPct: 3, cardFixed: 0.5 });
  near(e.expectedRevenue, 80 + 5);
  near(e.cardFee, 3.5 * 0.8);
  near(e.hours, 1);
});

test("studio cost is spread over booked hours only", () => {
  near(overheadPerHour({ ...free, chairHours: 100, utilPct: 50, rent: 600, otherMonthly: 400 }), 1000 / 50);
  const e = serviceEconomics(plain, { ...free, chairHours: 100, utilPct: 50, rent: 600, otherMonthly: 400 });
  near(e.takeHomePerHour, 100 - 20);
});

test("price for target is the price that makes take-home equal the target", () => {
  const s = { ...SHARED_DEFAULTS, targetHourly: 45 };
  const o = { ...SERVICE_DEFAULTS, noShowPct: 12, depositKept: 15 };
  const p = priceForTarget(o, s, 45);
  near(serviceEconomics({ ...o, price: p }, s).takeHomePerHour, 45, 1e-6);
});

test("break-even bookings cover rent and other costs, and are infinite if a booking loses money", () => {
  near(breakEvenBookings(plain, { ...free, rent: 500, otherMonthly: 500 }), 10);
  assert.equal(breakEvenBookings({ ...plain, supplies: 150 }, free), Infinity);
});

test("capacity is booked hours over chair hours per booking", () => {
  near(capacityBookings({ ...plain, apptMin: 90 }, { ...free, chairHours: 60, utilPct: 50 }), 20);
});

test("visits multiply the value of a client", () => {
  const e = serviceEconomics({ ...plain, visits: 6 }, free);
  near(e.perClient, 600);
  near(e.perClientHours, 6);
});

test("analyzeService warns on invalid input and on a loss", () => {
  assert.ok(analyzeService({ price: 0 }).warnings.length);
  const a = analyzeService({ ...plain, price: 20, supplies: 30 }, free);
  assert.match(a.warnings[0], /loses money/);
  const b = analyzeService({ ...plain, price: 100 }, { ...free, rent: 12000, utilPct: 100, chairHours: 100 });
  assert.match(b.warnings[0], /loses/);
});

test("compare ranks by take-home per hour and leaves out unpriced services", () => {
  const cmp = compare([{ name: "Slow", price: 100, apptMin: 120 }, { name: "Fast", price: 100, apptMin: 30 }, { name: "Empty", price: 0 }], free);
  assert.deepEqual(cmp.ranked.map((r) => r.name), ["Fast", "Slow"]);
  assert.equal(cmp.rows.length, 2);
  assert.equal(cmp.best.name, "Fast");
});

test("compare refuses shared inputs that cannot work", () => {
  const cmp = compare([{ price: 100 }], { utilPct: 0 });
  assert.equal(cmp.ranked.length, 0);
  assert.ok(cmp.sharedWarnings.length);
  assert.equal(readShared({ rent: "abc" }).rent, SHARED_DEFAULTS.rent);
});

test("csv has a header and one row per ranked service", () => {
  const cmp = compare([{ name: 'Full "set"', price: 180 }, { name: "Fill", price: 75, apptMin: 60 }], SHARED_DEFAULTS);
  const lines = toCsv(cmp).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(toCsv(cmp), /"Full ""set"""/);
  assert.equal(toCsv({ ranked: [] }), "");
});
