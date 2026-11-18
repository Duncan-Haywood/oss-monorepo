import test from "node:test";
import assert from "node:assert/strict";
import { toDay, fromDay, parseTrips, mergeTrips, analyze, summarize, money, SAMPLE, SAMPLE_OPTIONS, LIMITS, DAYS_REQUIRED } from "./engine.mjs";

test("date helpers round-trip and reject impossible dates", () => {
  assert.equal(fromDay(toDay("2024-02-29")), "2024-02-29");
  assert.ok(Number.isNaN(toDay("2025-02-29")));
  assert.ok(Number.isNaN(toDay("2025-13-01")));
  assert.equal(toDay("2025-01-02") - toDay("2025-01-01"), 1);
});

test("parseTrips reads ranges, present, comments, and reports bad lines", () => {
  const { trips, errors } = parseTrips("2025-01-01 to 2025-02-01 # a\n# c\n2025-03-01 - present\nnope\n2025-05-02 to 2025-05-01\n2025-02-30 to 2025-03-01", "2025-04-10");
  assert.equal(trips.length, 2);
  assert.equal(fromDay(trips[1].end), "2025-04-10");
  assert.equal(errors.length, 3);
});

test("mergeTrips joins overlapping and adjacent stays", () => {
  const t = (a, b) => ({ start: toDay(a), end: toDay(b) });
  const m = mergeTrips([t("2025-03-01", "2025-03-10"), t("2025-01-01", "2025-01-31"), t("2025-02-01", "2025-02-10"), t("2025-01-05", "2025-01-06")]);
  assert.equal(m.length, 2);
  assert.equal(fromDay(m[0].end), "2025-02-10");
});

test("exactly 330 days in a 365-day span qualifies; 329 does not", () => {
  const ok = analyze({ trips: "2025-01-01 to 2025-11-26", asOf: "2026-01-01", taxYear: 2025 });
  assert.equal(ok.best.days, 330);
  assert.equal(ok.qualifies, true);
  assert.equal(ok.slack, 0);
  const no = analyze({ trips: "2025-01-01 to 2025-11-25", asOf: "2026-01-01", taxYear: 2025 });
  assert.equal(no.best.days, 329);
  assert.equal(no.qualifies, false);
  assert.equal(no.windowShortfall, 1);
});

test("the 12-month span can start on any day, not only January 1", () => {
  const r = analyze({ trips: "2024-07-01 to 2025-06-24", asOf: "2025-07-01", taxYear: 2025 });
  assert.equal(r.qualifies, true);
  assert.equal(r.best.days, 359);
});

test("a gap that pushes a span below 330 days is found", () => {
  const r = analyze({ trips: "2025-01-01 to 2025-06-30\n2025-09-01 to 2025-12-31", asOf: "2026-01-01", taxYear: 2025 });
  assert.equal(r.qualifies, false);
  assert.ok(r.best.days < DAYS_REQUIRED);
});

test("earliest date a span holds 330 days", () => {
  const r = analyze({ trips: "2025-01-01 to 2025-12-31", asOf: "2026-01-01", taxYear: 2025 });
  assert.equal(fromDay(r.earliest), "2025-11-26");
});

test("exclusion is prorated by qualifying days and capped by income", () => {
  const r = analyze({ trips: "2025-01-01 to 2025-12-31", asOf: "2026-01-01", taxYear: 2025, income: 200000 });
  assert.equal(r.prorated, LIMITS[2025]);
  assert.equal(r.excluded, LIMITS[2025]);
  assert.equal(r.taxableAfter, 200000 - LIMITS[2025]);
  const low = analyze({ trips: "2025-01-01 to 2025-12-31", asOf: "2026-01-01", taxYear: 2025, income: 50000 });
  assert.equal(low.excluded, 50000);
  const part = analyze({ trips: "2025-07-01 to 2026-06-30", asOf: "2026-07-01", taxYear: 2025, income: 100000, limit: 130000 });
  // the 12-month span may begin up to 35 days before the first foreign day (365 - 330)
  assert.equal(part.qDaysInYear, 219);
  assert.equal(Math.round(part.prorated), Math.round(130000 * 219 / 365));
});

test("user-supplied limit overrides the table; leap-year span handled", () => {
  const r = analyze({ trips: "2024-01-01 to 2024-12-31", asOf: "2025-01-01", taxYear: 2024, income: 1, limit: 1000 });
  assert.equal(r.limit, 1000);
  assert.equal(r.daysInYear, 366);
  assert.equal(r.best.days, 366);
});

test("errors: no trips, bad as-of, bad tax year", () => {
  assert.throws(() => analyze({ trips: "", asOf: "2025-01-01" }), /at least one/);
  assert.throws(() => analyze({ trips: "2025-01-01 to 2025-02-01", asOf: "bad" }), /as-of/);
  assert.throws(() => analyze({ trips: "2025-01-01 to 2025-02-01", asOf: "2025-03-01", taxYear: 1900 }), /Tax year/);
});

test("sample gives the documented numbers", () => {
  const r = analyze({ trips: SAMPLE, ...SAMPLE_OPTIONS });
  assert.equal(r.best.days, 347);
  assert.equal(r.qualifies, true);
  assert.equal(r.maxOutside, 35);
  assert.equal(fromDay(r.earliest), "2025-09-04");
  assert.equal(r.excluded, 95000);
  assert.match(summarize(r).text, /347 full foreign days/);
  assert.equal(money(95000), "$95,000.00");
});

// Quality audit 2026-11-17 (portfolio/quality/audits/2026-11-17-feie-physical-presence-calculator.json).
test("a tax year with no built-in limit asks for one instead of borrowing 2025's", () => {
  assert.throws(() => analyze({ trips: "2027-01-01 to 2027-12-31", asOf: "2028-01-01", taxYear: 2027 }), /exclusion limit/);
  assert.equal(analyze({ trips: "2022-01-01 to 2022-12-31", asOf: "2023-01-01", taxYear: 2022, income: 200000 }).excluded, 112000); // Rev. Proc. 2021-45
});

test("the limit is prorated by qualifying days over the days in the year", () => {
  const r = analyze({ trips: "2025-07-01 to 2026-06-30", asOf: "2026-07-01", taxYear: 2025, income: 200000, limit: 130000 });
  assert.equal(r.excluded.toFixed(2), "78000.00"); // 130,000 x 219/365
  const leap = analyze({ trips: "2024-07-01 to 2025-06-30", asOf: "2025-07-01", taxYear: 2024, income: 200000 });
  assert.equal(leap.qDaysInYear, 219); // window 2024-05-27 to 2025-05-26 holds 330 foreign days
  assert.equal(leap.daysInYear, 366);
  assert.equal(leap.excluded.toFixed(2), "75692.62"); // 126,500 x 219/366
});

test("no earliest date when no window reaches 330 days", () => {
  const r = analyze({ trips: "2024-01-01 to 2024-01-01\n2024-02-08 to 2025-01-01", asOf: "2025-02-01", taxYear: 2024 });
  assert.equal(r.best.days, 329);
  assert.equal(r.earliest, null);
});

test("days of a qualifying period outside the stays carry the tax-home caveat", () => {
  const r = analyze({ trips: "2025-07-01 to 2026-06-30", asOf: "2026-07-01", taxYear: 2025, income: 200000, limit: 130000 });
  assert.match(summarize(r).text, /tax home/);
});
