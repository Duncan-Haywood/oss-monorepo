import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, benchmark, fica, shapes, analyze, num, money, toCsv, dates, calendarIcs, parseDate, isoDate } from "./calc.mjs";

test("benchmark is one to three weeks per year with a mid at the chosen rate", () => {
  const b = benchmark({ ...DEFAULTS, yearsService: 6, offeredWeeks: 8, benchmarkWeeksPerYear: 2 });
  assert.equal(b.low, 6);
  assert.equal(b.mid, 12);
  assert.equal(b.high, 18);
  assert.equal(b.gapWeeks, 4);
  assert.ok(Math.abs(b.gapPay - 4 * 120000 / 52) < 1e-9);
});

test("no gap when the offer meets the benchmark", () => {
  assert.equal(benchmark({ ...DEFAULTS, offeredWeeks: 20 }).gapWeeks, 0);
});

test("fica: social security stops at the wage base, medicare does not", () => {
  assert.ok(Math.abs(fica(10000, 0, 184500) - 10000 * 0.0765) < 1e-9);
  assert.ok(Math.abs(fica(10000, 180000, 184500) - (4500 * 0.062 + 10000 * 0.0145)) < 1e-9);
  assert.ok(Math.abs(fica(10000, 200000, 184500) - 10000 * 0.0145) < 1e-9);
});

test("supplemental withholding is 22% to $1M and 37% above", () => {
  const o = { ...DEFAULTS };
  assert.equal(shapes(o, 50000).lumpNow.fedWithheld, 11000);
  assert.equal(shapes(o, 1200000).lumpNow.fedWithheld, 220000 + 200000 * 0.37);
});

test("filing gap: marginal rate above 22% means a bill at filing", () => {
  const s = shapes({ ...DEFAULTS, fedRateThisYear: 32 }, 50000);
  assert.ok(Math.abs(s.lumpNow.filingGap - 5000) < 1e-9);
  const r = shapes({ ...DEFAULTS, fedRateThisYear: 12 }, 50000);
  assert.ok(r.lumpNow.filingGap < 0);
});

test("salary continuation splits across the year end", () => {
  const s = shapes({ ...DEFAULTS, weeksLeftInYear: 4 }, 8 * 120000 / 52);
  assert.ok(Math.abs(s.continuation.thisYear - 4 * 120000 / 52) < 1e-6);
  assert.ok(Math.abs(s.continuation.nextYear - 4 * 120000 / 52) < 1e-6);
  assert.ok(Math.abs(s.continuation.gross - (s.continuation.thisYear + s.continuation.nextYear)) < 1e-6);
});

test("default example", () => {
  const a = analyze({});
  assert.equal(a.verdict, "low-mid");
  assert.ok(Math.abs(a.severance - 8 * 120000 / 52) < 1e-9);
  assert.ok(Math.abs(a.pto - 12 * 120000 / 260) < 1e-9);
  assert.ok(a.shapes.lumpJan.net > 0);
  assert.ok(a.runwayMonths > a.runwayMonthsNoSeverance);
  assert.ok(a.checklist.some((c) => /OWBPA/.test(c)));
});

test("PTO is excluded when the state does not require payout", () => {
  assert.equal(analyze({ ptoPaidOutByLaw: false }).pto, 0);
});

test("under 40 gets the general timing line, not the OWBPA one", () => {
  assert.ok(!analyze({ age: 35 }).checklist.some((c) => /OWBPA/.test(c)));
});

test("verdict bands", () => {
  assert.equal(analyze({ offeredWeeks: 2 }).verdict, "below");
  assert.equal(analyze({ offeredWeeks: 12 }).verdict, "at-or-above");
  assert.equal(analyze({ offeredWeeks: 40 }).verdict, "high");
});

test("health gap and COBRA subsidy", () => {
  const a = analyze({ cobraMonthly: 2000, employerPaidMonthly: 1500, coveredMonths: 4 });
  assert.equal(a.healthPerMonthGap, 500);
  assert.equal(a.subsidyValue, 6000);
});

test("bad input is reported", () => {
  assert.equal(analyze({ annualSalary: 0 }).result, null);
  assert.ok(analyze({ stateRate: 120 }).warnings.length > 0);
  assert.ok(analyze({ savings: NaN }).warnings.length > 0);
});

test("num, money, csv", () => {
  assert.equal(num("$1,200"), 1200);
  assert.equal(money(-1234.4), "-$1,234");
  assert.match(toCsv(analyze({})), /Net if lump sum paid in January/);
});

test("age 40+ gets 21 days (individual) or 45 (group) to consider, then 7 to revoke", () => {
  const ind = dates({ age: 44, releaseReceived: "2026-11-06" });
  assert.equal(isoDate(ind.rows[0].date), "2026-11-27");
  assert.equal(isoDate(ind.rows[1].date), "2026-12-04");
  const grp = dates({ age: 44, groupProgram: true, releaseReceived: "2026-11-06" });
  assert.equal(isoDate(grp.rows[0].date), "2026-12-21");
});

test("under 40 there is no federal review period, only a reminder to ask", () => {
  const r = dates({ age: 35, releaseReceived: "2026-11-06" });
  assert.equal(r.rows.length, 1);
  assert.match(r.rows[0].label, /no federal minimum/);
});

test("a vest within 90 days after the last day produces an ask and a critical row", () => {
  const r = dates({ age: 30, separationDate: "2026-11-20", nextVestDate: "2026-12-15" });
  assert.equal(r.vestGapDays, 25);
  assert.equal(r.asks.length, 1);
  assert.ok(r.rows.some((x) => /Next equity vest/.test(x.label) && x.critical));
});

test("WARN flag only for large-employer layoffs with under 60 days of notice", () => {
  const short = dates({ age: 30, largeEmployerLayoff: true, releaseReceived: "2026-11-06", separationDate: "2026-11-20" });
  assert.ok(short.rows.some((x) => /WARN/.test(x.label)));
  const none = dates({ age: 30, releaseReceived: "2026-11-06", separationDate: "2026-11-20" });
  assert.ok(!none.rows.some((x) => /WARN/.test(x.label)));
});

test("dates ignores blank or impossible input and the ics has one event per row", () => {
  assert.deepEqual(dates({}).rows, []);
  assert.equal(parseDate("2026-02-31"), null);
  const r = dates({ age: 50, releaseReceived: "2026-11-06", separationDate: "2026-11-20" });
  const ics = calendarIcs(r.rows);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, r.rows.length);
  assert.match(ics, /^BEGIN:VCALENDAR/);
});

test("continuation: next-year pay starts the wage base at zero, and net is the sum of both years", () => {
  // Already over the Social Security wage base this year: this year's weeks pay no SS, next year's do.
  const o = { ...DEFAULTS, annualSalary: 260000, ytdWages: 260000, weeksLeftInYear: 4 };
  const gross = 8 * 260000 / 52;
  const c = shapes(o, gross).continuation;
  const half = gross / 2;
  assert.ok(Math.abs(c.fica - (0.0145 * half + 0.062 * half + 0.0145 * half)) < 1e-6);
  assert.ok(Math.abs(c.net - (c.gross - c.fica - c.fed - c.state)) < 1e-6);
});

test("WARN flag fires at 59 days of notice and not at exactly 60", () => {
  const at = (sep) => dates({ age: 30, largeEmployerLayoff: true, releaseReceived: "2026-11-01", separationDate: sep }).rows.some((x) => /WARN/.test(x.label));
  assert.equal(at("2026-12-30"), true); // 59 days
  assert.equal(at("2026-12-31"), false); // 60 days
});

test("savings feed the cash runway", () => {
  const a = analyze({ annualSalary: 100000 }), b = analyze({ annualSalary: 100000, savings: DEFAULTS.savings + 1 });
  assert.ok(b.runwayMonthsNoSeverance > a.runwayMonthsNoSeverance);
});

test("continuation: next-year pay owes Social Security on the full wage base", () => {
  const o = { ...DEFAULTS, annualSalary: 52000, ytdWages: 0, ssWageBase: 1000, weeksLeftInYear: 0 };
  const c = shapes(o, 10000).continuation; // all 10000 falls in next year, base 1000
  assert.ok(Math.abs(c.fica - (0.062 * 1000 + 0.0145 * 10000)) < 1e-9);
});

test("default savings is 20000", () => {
  assert.equal(DEFAULTS.savings, 20000);
});
