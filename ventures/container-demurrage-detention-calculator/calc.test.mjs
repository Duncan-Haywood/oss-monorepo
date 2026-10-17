import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, parseDay, fmtDay, weekday, countDays, lastFreeDay, tiered, nextDayRate, compare, totalWithShift, sensitivity, rushTable } from "./calc.mjs";

test("num parses money text, NaN on blank", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("dates: real calendar days only, round trip, weekday", () => {
  assert.ok(Number.isNaN(parseDay("2026-02-30")));
  assert.ok(Number.isNaN(parseDay("03/02/2026")));
  assert.equal(fmtDay(parseDay("2026-03-02")), "2026-03-02");
  assert.equal(weekday(parseDay("2026-03-02")), 1); // Monday
  assert.equal(weekday(parseDay("1969-12-31")), 3); // negative days still work
});

test("countDays counts (start, end] and can skip weekends", () => {
  const mon = parseDay("2026-03-02");
  const fri2 = parseDay("2026-03-13");
  assert.equal(countDays(mon, fri2, true), 11);
  assert.equal(countDays(mon, fri2, false), 9);
  assert.equal(countDays(fri2, mon, true), 0);
  assert.equal(countDays(NaN, fri2, true), 0);
});

test("last free day: calendar vs weekdays-only", () => {
  const mon = parseDay("2026-03-02");
  assert.equal(fmtDay(lastFreeDay(mon, 4, true)), "2026-03-06");
  assert.equal(fmtDay(lastFreeDay(mon, 5, false)), "2026-03-09"); // Tue..Fri = 4, Mon 9th = 5th
  assert.equal(fmtDay(lastFreeDay(mon, 0, true)), "2026-03-02");
});

test("tiers: first, second, then the open-ended third rate", () => {
  assert.equal(tiered(0, 5, 175, 5, 275, 375), 0);
  assert.equal(tiered(5, 5, 175, 5, 275, 375), 875);
  assert.equal(tiered(7, 5, 175, 5, 275, 375), 875 + 550);
  assert.equal(tiered(12, 5, 175, 5, 275, 375), 875 + 1375 + 750);
  assert.equal(nextDayRate(4, 5, 175, 5, 275, 375), 175);
  assert.equal(nextDayRate(5, 5, 175, 5, 275, 375), 275);
  assert.equal(nextDayRate(10, 5, 175, 5, 275, 375), 375);
});

// Hand-worked: discharge Mon 2 Mar, pickup Fri 13 Mar = 11 counted days, 4 free -> 7 chargeable:
// 5 x 175 + 2 x 275 = 1,425 a box. Return Tue 24 Mar = 11 counted days, 4 free -> 7:
// 5 x 150 + 2 x 250 = 1,250 a box. Two boxes: 2,850 + 2,500 = 5,350.
test("worked example: two boxes, 7 chargeable days on each clock", () => {
  const c = compare(DEFAULTS);
  assert.equal(c.dem.chargeable, 7);
  assert.equal(c.dem.perContainer, 1425);
  assert.equal(c.dem.total, 2850);
  assert.equal(c.det.total, 2500);
  assert.equal(c.total, 5350);
  assert.equal(fmtDay(c.dem.lastFree), "2026-03-06");
  assert.equal(fmtDay(c.det.lastFree), "2026-03-17");
  assert.equal(c.dem.nextDay, 550); // day 8 is in tier 2: 275 x 2 boxes
});

test("weekdays-only demurrage: 9 counted days, 5 chargeable, 875 a box", () => {
  const c = compare({ ...DEFAULTS, demCountWeekends: 0 });
  assert.equal(c.dem.counted, 9);
  assert.equal(c.dem.perContainer, 875);
});

test("exemption days (terminal closed, hold on the box) add to free time", () => {
  const c = compare({ ...DEFAULTS, demExempt: 3 });
  assert.equal(c.dem.chargeable, 4);
  assert.equal(c.dem.perContainer, 700);
  assert.equal(fmtDay(c.dem.lastFree), "2026-03-09");
});

test("inside free time costs nothing; bad dates and blanks cost nothing and never throw", () => {
  assert.equal(compare({ ...DEFAULTS, pickupDate: "2026-03-05" }).dem.total, 0);
  const bad = compare({ ...DEFAULTS, pickupDate: "" });
  assert.equal(bad.dem.total, 0);
  assert.equal(bad.det.total, 0);
  assert.equal(compare({ ...DEFAULTS, containers: 0 }).total, 5350 / 2); // at least one box
});

test("returning before pickup is zero detention, not negative", () => {
  assert.equal(compare({ ...DEFAULTS, returnDate: "2026-03-01" }).det.total, 0);
});

test("shifts: an unchanged shift reproduces the base bill", () => {
  assert.equal(totalWithShift(DEFAULTS, 0, 0), compare(DEFAULTS).total);
  const g = sensitivity(DEFAULTS);
  assert.equal(g.length, 5);
  assert.equal(g[2].cells[2].total, compare(DEFAULTS).total);
  assert.ok(g[4].cells[0].total > 0);
});

// Pulling pickup and return forward N days keeps detention the same length and only trims
// demurrage. One day earlier: 7 -> 6 chargeable, saves one tier-2 day, 275 a box.
test("rush table: only the port-side clock changes when the whole chain moves earlier", () => {
  const rows = rushTable(DEFAULTS);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].saving, 550);
  assert.equal(rows[0].perContainer, 275);
  assert.equal(rows[2].perContainer, 725); // 7 -> 4 chargeable: 1425 - 700
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].saving >= rows[i - 1].saving);
  // Detention (pickup -> return) is untouched by moving both together.
  const moved = totalWithShift(DEFAULTS, -3, -3) - compare({ ...DEFAULTS, demFree: DEFAULTS.demFree }).det.total;
  assert.equal(moved, 1400);
});
