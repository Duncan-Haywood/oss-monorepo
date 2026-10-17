import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrequencies, parseAddOns, analyze, sampleJob, reportCsv, money, money2 } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const base = { homeSqft: 1000, sqftPerLaborHour: 500, wagePerHour: 20, suppliesPerVisit: 5, cardFeePct: 3, targetMarginPct: 30, basePrice: 100 };
const weekly = parseFrequencies("Weekly,52,1,0").rows;

test("hand-calculated single visit: 2 person-hours at $20, $5 supplies, 3% fee", () => {
  const r = analyze(base, weekly);
  const l = r.lines[0];
  near(l.personHours, 2);
  near(l.wages, 40);
  near(l.cost, 45);
  near(l.cardFee, 3);
  near(l.profit, 52);
  near(l.marginPct, 52);
  near(l.floor, 45 / 0.67);
  near(l.maxDiscountPct, (1 - 45 / 0.67 / 100) * 100);
  near(l.annualProfit, 52 * 52);
  assert.equal(l.meetsTarget, true);
});

test("burden, bathrooms, drive time and mileage all land in cost", () => {
  const r = analyze({ ...base, bathrooms: 3, minutesPerBathroom: 20, burdenPct: 10, crewSize: 2, driveMinutesOneWay: 15, milesRoundTrip: 10, costPerMile: 0.5 }, weekly);
  // clean hours 2 + 1 = 3; drive 2*15*2/60 = 1 person-hour; wages (3+1)*20*1.1 = 88; mileage 5; supplies 5
  near(r.cleanHours, 3);
  near(r.driveHours, 1);
  near(r.lines[0].cost, 88 + 5 + 5);
  near(r.lines[0].onSiteHoursPerPerson, 1.5);
});

test("time multiplier and discount: weekly 0.8x with 20% off", () => {
  const r = analyze(base, parseFrequencies("Weekly,52,0.8,20").rows);
  const l = r.lines[0];
  near(l.personHours, 1.6);
  near(l.cost, 1.6 * 20 + 5);
  near(l.price, 80);
  near(l.listPriceNeeded, l.floor / 0.8);
});

test("add-ons add minutes, supplies and revenue", () => {
  const a = parseAddOns("add-on,minutes,supplies,price\nOven,30,2,35\nFridge,20,1,25");
  assert.equal(a.rows.length, 2);
  const r = analyze(base, weekly, a.rows);
  near(r.addMinutes, 50);
  near(r.addRevenue, 60);
  near(r.lines[0].listPrice, 160);
  near(r.lines[0].personHours, 2 + 50 / 60);
  near(r.lines[0].supplies, 8);
});

test("a deep discount below the floor misses target and the list price needed is reported", () => {
  const r = analyze(base, parseFrequencies("One-time,1,1.5,0\nWeekly,52,1,45").rows);
  assert.equal(r.lines[0].meetsTarget, true);
  assert.equal(r.lines[1].meetsTarget, false);
  assert.match(r.verdict, /1 of 2/);
  near(r.neededListPrice, r.lines[1].floor / 0.55);
});

test("a visit that costs more than it earns is flagged as losing", () => {
  const r = analyze({ ...base, basePrice: 30 }, weekly);
  assert.ok(r.lines[0].profit < 0);
  assert.match(r.warnings.join(" "), /loses money/);
});

test("input validation names the problem", () => {
  assert.match(analyze({ ...base, homeSqft: 0 }, weekly).error, /square feet/);
  assert.match(analyze({ ...base, sqftPerLaborHour: 0 }, weekly).error, /per labor hour/);
  assert.match(analyze({ ...base, crewSize: 1.5 }, weekly).error, /Crew size/);
  assert.match(analyze({ ...base, wagePerHour: 0 }, weekly).error, /wage/);
  assert.match(analyze({ ...base, targetMarginPct: 98 }, weekly).error, /under 100/);
  assert.match(analyze({ ...base, basePrice: 0 }, weekly).error, /one-time/);
  assert.match(analyze({ ...base, wagePerHour: "abc" }, weekly).error, /wagePerHour/);
});

test("parsers skip bad lines, keep header optional, and accept tabs and $", () => {
  const f = parseFrequencies("label,visits,mult,disc\nWeekly,52,0.8,20\nbad line\nZero,0,1,0\nMonthly\t12\t1\t$5");
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[1].discountPct, 5);
  assert.match(f.warnings[0], /2 frequency line/);
  assert.match(parseFrequencies("").error, /at least one/);
  assert.deepEqual(parseAddOns("").rows, []);
});

test("sample job analyzes and exports CSV", () => {
  const s = sampleJob();
  const r = analyze(s.job, parseFrequencies(s.frequencies).rows, parseAddOns(s.addOns).rows);
  assert.ok(!r.error);
  assert.equal(r.lines.length, 4);
  const csv = reportCsv(r);
  assert.equal(csv.trim().split("\n").length, 5);
  assert.match(csv, /Price floor for target/);
});

test("money formatting", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
