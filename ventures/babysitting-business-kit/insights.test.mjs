import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";
import * as IN from "./insights.mjs";

// A small desk with hand-checkable numbers. Rate $20/h, $3 per extra child, 3 h minimum,
// no late or holiday extras in play. 2026 mileage: $0.725 to June 30, $0.76 from July 1.
function desk() {
  const d = E.emptyDesk();
  d.profile.availability = "Mon-Fri 15-21; Sat 9-17"; // 5 x 6 h + 8 h = 38 h a week
  d.profile.rates = { ...d.profile.rates, lateExtra: 0, lastMinuteFee: 0 };
  d.profile.holidays = [];
  d.profile.name = "Sam Sitter";
  d.families = [
    { id: "near", name: "Near family", contactName: "Pat Near", kids: [{ name: "Ivy" }], travelMinutes: 10 },
    { id: "far", name: "Far family", contactName: "Lee Far", kids: [{ name: "Max" }, { name: "Zoe" }], travelMinutes: 60 },
  ];
  d.bookings = [
    // Near: 4 h, 1 kid, $80, 2 mi in October at $0.76 = $1.52. Real hours 4 + 10/60.
    { id: "n1", familyId: "near", date: "2026-10-05", start: "16:00", end: "20:00", kids: 1, miles: 2, status: "done", payments: [{ amount: 80, date: "2026-10-05" }] },
    // Far: 2 h actual padded to the 3 h minimum, 2 kids at $23/h = $69; 30 mi = $22.80; 1 h drive.
    { id: "f1", familyId: "far", date: "2026-10-10", start: "10:00", end: "12:00", kids: 2, miles: 30, status: "done", payments: [{ amount: 69, date: "2026-10-12" }] },
    { id: "x1", familyId: "far", date: "2026-10-17", start: "10:00", end: "12:00", kids: 2, miles: 30, status: "cancelled" },
  ];
  return d;
}

test("sitMinutes handles past-midnight sits", () => {
  assert.equal(IN.sitMinutes({ start: "21:00", end: "01:00" }), 240);
  assert.equal(IN.sitMinutes({ start: "x", end: "1" }), 0);
});

test("travel time comes from the sit, then the family, then miles at the sitter's assumed speed", () => {
  assert.deepEqual(IN.travelMinutes({ travelMinutes: 15, miles: 50 }, { travelMinutes: 40 }), { minutes: 15, source: "sit" });
  assert.deepEqual(IN.travelMinutes({ miles: 50 }, { travelMinutes: 40 }), { minutes: 40, source: "family" });
  assert.deepEqual(IN.travelMinutes({ miles: 10 }, {}, { travelMph: 30 }), { minutes: 20, source: "estimate" });
  assert.deepEqual(IN.travelMinutes({}, {}), { minutes: 0, source: "none" });
});

test("effective hourly counts the drive, the car and minimum-hour padding, best family first", () => {
  const r = IN.familyRates(desk(), { today: "2026-10-30" });
  assert.deepEqual(r.rows.map((x) => x.familyId), ["near", "far"]);
  const near = r.rows[0], far = r.rows[1];
  assert.equal(near.earned, 80);
  assert.equal(near.mileageCost, 1.52);
  assert.equal(near.perSitHour, 20);
  assert.equal(near.effectiveHourly, Math.round(((80 - 1.52) / (4 + 10 / 60)) * 100) / 100); // 18.84
  assert.equal(far.earned, 69);
  assert.equal(far.paddingHours, 1);
  assert.equal(far.paddingEarned, 23);
  assert.equal(far.perSitHour, 34.5); // $69 for 2 h at the house looks great...
  assert.equal(far.effectiveHourly, Math.round(((69 - 22.8) / 3) * 100) / 100); // ...$15.40 per real hour
  assert.equal(r.total.sits, 2); // the cancelled sit is left out
  assert.ok(r.notes.some((n) => /Near family pays you the most per real hour/.test(n)));
  assert.ok(r.notes.some((n) => /Far family: driving is 33%/.test(n)));
  assert.ok(r.notes.some((n) => /minimum-hours rule added 1 billed hours \(about \$23\.00\)/.test(n)));
});

test("an agreed price wins over the rate card, and weekly repeats count each past week", () => {
  const d = desk();
  d.bookings = [{ id: "w", familyId: "near", date: "2026-10-01", start: "15:00", end: "18:00", kids: 1, price: 75, repeatWeeks: 4, status: "scheduled" }];
  const r = IN.familyRates(d, { today: "2026-10-20" });
  assert.equal(r.rows[0].sits, 3); // Oct 1, 8, 15; Oct 22 is after today
  assert.equal(r.rows[0].earned, 225);
});

test("income by weekday and season", () => {
  const p = IN.incomePatterns(desk(), { today: "2026-10-30" });
  assert.equal(p.byWeekday[1].earned, 80); // Mon Oct 5
  assert.equal(p.byWeekday[6].earned, 69); // Sat Oct 10
  assert.equal(p.topDay, "Mon");
  assert.equal(p.bySeason.find((s) => s.season === "fall").earned, 149);
  assert.equal(p.bySeason.find((s) => s.season === "summer").sits, 0);
  assert.deepEqual(IN.SEASONS.flatMap((s) => s.months).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("capacity compares booked hours with weekly availability", () => {
  assert.deepEqual(IN.availableHours("Mon-Fri 15-21; Sat 9-17").byDay, [0, 6, 6, 6, 6, 6, 8]);
  const d = desk();
  d.bookings.push({ id: "up", familyId: "near", date: "2026-11-02", start: "15:00", end: "19:00", kids: 1, status: "scheduled", repeatWeeks: 4 });
  const c = IN.capacity(d, "2026-10-30", { weeksBack: 4, weeksAhead: 4 });
  assert.equal(c.availableWeek, 38);
  assert.equal(c.weeks.length, 8);
  const wk = c.weeks.find((w) => w.start === "2026-10-04");
  assert.equal(wk.hours, 6); // 4 h Monday + 2 h Saturday
  assert.equal(wk.pct, 16);
  assert.equal(c.weeks.find((w) => w.start === "2026-10-11").hours, 0); // the cancelled sit is not booked time
  // Ahead: this week (Oct 25-31, no sits) and three weeks with a 4 h Monday.
  assert.equal(c.aheadAvgHours, 3);
  assert.equal(c.openHoursAhead, 38 * 4 - 12);
  assert.equal(c.byDay[1].booked, 1); // 4 h of Mondays over 4 past weeks
  assert.equal(c.byDay[0].pct, null); // no Sunday availability
});

test("a rate raise shows the change per family per month and drafts a kind notice", () => {
  const d = desk();
  d.bookings.push({ id: "fut", familyId: "far", date: "2026-11-07", start: "10:00", end: "13:00", kids: 2, status: "scheduled" });
  const r = IN.raisePlan(d, { newRate: 22, effective: "2027-01-04", today: "2026-10-30", lookbackDays: 90 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.noticeDays, 66);
  const months = 90 / (365.25 / 12);
  const near = r.rows.find((x) => x.familyId === "near");
  assert.equal(near.change, Math.round(((4 * 2) / months) * 100) / 100); // 4 billed h x $2
  const far = r.rows.find((x) => x.familyId === "far");
  assert.equal(far.change, Math.round(((3 * 2) / months) * 100) / 100); // padded 3 billed h x $2
  assert.equal(far.bookedBefore, 1);
  assert.match(far.message, /^Hi Lee! It's Sam Sitter\. Thank you so much for trusting me with Max and Zoe\./);
  assert.match(far.message, /starting Monday, January 4, 2027, my hourly rate will go from \$20\.00 to \$22\.00/);
  assert.match(far.message, /The sit already on the calendar before then stays at the current rate/);
  assert.doesNotMatch(far.message, /market|average rate|other sitters/i);
  assert.equal(r.yearlyChange, Math.round(r.monthlyChange * 12 * 100) / 100);
});

test("a rate raise checks its inputs and only quotes a comparison the sitter typed", () => {
  const d = desk();
  assert.equal(IN.raisePlan(d, { today: "2026-10-30" }).errors.length, 2);
  assert.match(IN.raisePlan(d, { newRate: 22, effective: "2026-10-01", today: "2026-10-30" }).errors.join(), /past/);
  const short = IN.raisePlan(d, { newRate: 22, effective: "2026-11-10", today: "2026-10-30" });
  assert.ok(short.notes.some((n) => /more notice is kinder/.test(n)));
  assert.ok(!short.notes.some((n) => /comparison/.test(n)));
  d.profile.insights = { localRate: 24, localRateNote: "two sitters at church" };
  assert.ok(IN.raisePlan(d, { newRate: 22, effective: "2027-01-04", today: "2026-10-30" }).notes.some((n) => n === "Your own local comparison: $24.00 an hour (two sitters at church)."));
});

test("the income letter totals recorded payments by month and says it is self-prepared", () => {
  const d = desk();
  d.profile.businessName = "Sam Sits";
  d.profile.address = "1 Main St";
  d.expenses = [{ id: "e", date: "2026-03-01", amount: 40, category: "training" }];
  const L = IN.incomeLetter(d, { year: 2026, today: "2026-10-30", addressee: "Oak Apartments leasing office" });
  assert.equal(L.months.length, 10);
  assert.equal(L.months[9].amount, 149);
  assert.equal(L.total, 149);
  assert.equal(L.payCount, 2);
  assert.equal(L.families, 2);
  assert.match(L.text, /To: Oak Apartments leasing office/);
  assert.match(L.text, /I, Sam Sitter, doing business as Sam Sits, am a self-employed babysitter/);
  assert.match(L.text, /January 1 through October 30, 2026/);
  assert.match(L.text, /self-prepared summary/);
  assert.match(L.text, /not a tax return, a tax form or a document from the IRS/);
  assert.match(L.text, /Signed: _+/);
  assert.match(L.text, /1 Main St/);
  assert.doesNotMatch(L.text, /net self-employment/);
  const N = IN.incomeLetter(d, { year: 2026, today: "2026-10-30", includeNet: true });
  assert.equal(N.expenses, 40);
  assert.equal(N.mileage, 24.32);
  assert.equal(N.net, 84.68);
  assert.match(N.html, /Self-prepared summary, not a tax document/);
  assert.match(N.html, /<!doctype html>/);
  // A past year runs through December.
  assert.equal(IN.incomeLetter(d, { year: 2025, today: "2026-10-30" }).months.length, 12);
});

test("year over year waits for two years, then compares the same stretch of each", () => {
  const d = desk();
  assert.equal(IN.yearOverYear(d, "2026-10-30"), null);
  d.bookings.push(
    { id: "old1", familyId: "near", date: "2025-10-06", start: "16:00", end: "19:00", kids: 1, status: "done", payments: [{ amount: 60, date: "2025-10-06" }] },
    { id: "old2", familyId: "near", date: "2025-12-01", start: "16:00", end: "19:00", kids: 1, status: "done", payments: [{ amount: 60, date: "2025-12-01" }] },
  );
  const y = IN.yearOverYear(d, "2026-10-30");
  assert.equal(y.thisYear.year, 2026);
  assert.equal(y.lastYear.year, 2025);
  assert.equal(y.lastYear.paid, 60); // December 2025 is after Oct 30, so not compared
  assert.equal(y.thisYear.paid, 149);
  assert.equal(y.change.paid, 89);
  assert.equal(y.change.paidPct, 148.3);
  assert.equal(y.change.families, 1);
  assert.equal(y.months.length, 10);
  assert.equal(y.months[9].change, 89);
  assert.deepEqual(y.fullYears.map((f) => [f.year, f.paid, f.partial]), [[2025, 120, false], [2026, 149, true]]);
});

test("the example desk produces insights without errors", () => {
  const d = E.exampleDesk("2026-11-02");
  assert.ok(IN.familyRates(d, { today: "2026-11-02" }).rows.length >= 2);
  assert.ok(IN.capacity(d, "2026-11-02").availableWeek > 0);
  assert.equal(IN.raisePlan(d, { newRate: 22, effective: "2027-01-04", today: "2026-11-02" }).rows.length, 2);
  assert.ok(IN.incomeLetter(d, { today: "2026-11-02" }).total > 0);
});
