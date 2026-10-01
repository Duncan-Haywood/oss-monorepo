import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRows, parseHours, parseDate, analyze, quantile, rng, reportCsv, sampleText, MIN_MONTHS, monthLabel } from "./calc.mjs";

// One log row per month, mid-month, so hand counts are obvious.
function log(client, hoursByMonth, startYear = 2025, startMonth = 1, billedRate = null) {
  return hoursByMonth.map((h, i) => {
    const idx = startYear * 12 + (startMonth - 1) + i;
    const y = Math.floor(idx / 12), m = (idx % 12) + 1;
    const date = `${y}-${String(m).padStart(2, "0")}-15`;
    return `${date},${client},${h}${billedRate ? "," + (h * billedRate) : ""}`;
  }).join("\n");
}
function run(text, opts = {}) {
  const p = parseRows(text);
  assert.ok(!p.error, p.error);
  return analyze(p.rows, { rate: 100, retainer: 1500, ...opts });
}

test("quantile interpolates and matches hand counts", () => {
  assert.equal(quantile([10, 10, 10, 20, 20, 20], 0.5), 15);
  assert.equal(quantile([10, 10, 10, 20, 20, 20], 0.8), 20);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.8), 4.2);
  assert.equal(quantile([7], 0.8), 7);
  assert.equal(quantile([], 0.5), null);
});

test("parsing: dates, hours in decimal and h:mm, header, bad rows", () => {
  assert.equal(parseHours("1:30"), 1.5);
  assert.equal(parseHours("2.25"), 2.25);
  assert.equal(parseHours("3 hrs"), 3);
  assert.equal(parseHours("abc"), null);
  assert.ok(parseDate("2026-03-14") === parseDate("3/14/2026"));
  assert.equal(parseDate("2026-02-30"), null);
  const p = parseRows("date,client,hours,billed\n2026-01-05,Acme,2,200\nnot a row\n2026-01-06,Acme,0,0\n2026-01-07,Acme,1:30");
  assert.equal(p.header, true);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].hours, 1.5);
  assert.equal(p.rows[1].billed, null);
  assert.equal(p.warnings.length, 2);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("x,y,z").error);
});

test("hand-counted six months of 10 and 20 hours", () => {
  const r = run(log("Acme", [10, 20, 10, 20, 10, 20]));
  const c = r.clients[0];
  assert.equal(c.n, 6);
  assert.equal(c.mean, 15);
  assert.equal(c.p50, 15);
  assert.equal(c.p80, 20);
  assert.equal(c.max, 20);
  assert.equal(c.effective.p50, 100); // 1500 / 15
  assert.equal(c.effective.p80, 75); // 1500 / 20
  assert.equal(c.effective.worst, 75);
  assert.equal(c.breakEvenHours, 15);
  assert.equal(c.underpayProb, 0.5); // 20 h * $100 = $2000 > $1500 in 3 of 6 months
  assert.equal(c.retainerForTarget, 2000); // $100/h target at the 80th percentile, 20 h
  assert.equal(c.coverageAtRetainer, 0.5); // months at or under 15 h
  assert.equal(c.hourlyMean, 1500);
  assert.equal(c.retainerMinusHourly, 0);
  assert.equal(c.holdout, null);
  assert.equal(c.verdict, "weak");
});

test("target rate and coverage change the recommended retainer", () => {
  const r = run(log("Acme", [10, 20, 10, 20, 10, 20]), { target: 80, coverage: 0.5 });
  assert.equal(r.clients[0].retainerForTarget, 80 * 15);
  assert.equal(r.clients[0].coveredQuantileHours, 15);
});

test("months with no entries inside a client's span count as zero hours", () => {
  const text = [log("Acme", [10, 10], 2025, 1), log("Acme", [10, 10, 10, 10], 2025, 5)].join("\n");
  const c = run(text).clients[0];
  assert.equal(c.n, 8);
  assert.equal(c.zeroMonths, 2);
  assert.equal(c.mean, 7.5);
  assert.equal(c.effective.worst, 150); // 1500 / 10
  assert.equal(c.min, 0);
});

test("entries in one month are summed and client names match case-insensitively", () => {
  const text = [log("Acme", [5, 5, 5, 5, 5, 5]), log("ACME", [5, 5, 5, 5, 5, 5])].join("\n");
  const r = run(text);
  assert.equal(r.clients.length, 1);
  assert.equal(r.clients[0].mean, 10);
});

test("refuses a client with fewer than six months, and everything when none qualifies", () => {
  assert.equal(MIN_MONTHS, 6);
  const five = run(log("Acme", [10, 10, 10, 10, 10]));
  assert.match(five.error, /6 months/);
  assert.equal(five.excluded[0].months, 5);
  const mixed = run([log("Acme", [10, 10, 10, 10, 10, 10]), log("Short", [4, 4, 4])].join("\n"));
  assert.equal(mixed.clients.length, 1);
  assert.match(mixed.warnings.join(" "), /Short has 3 months/);
});

test("the latest month can be left out when it is incomplete", () => {
  const text = log("Acme", [10, 10, 10, 10, 10, 10, 1]);
  assert.equal(run(text).clients[0].n, 7);
  const r = run(text, { includeLastMonth: false });
  assert.equal(r.clients[0].n, 6);
  assert.equal(r.clients[0].mean, 10);
  assert.match(r.warnings.join(" "), /left out/);
});

test("a mid-month last entry warns that the month may be partial", () => {
  const r = run(log("Acme", [10, 10, 10, 10, 10, 10]));
  assert.match(r.warnings.join(" "), /latest entry is/);
});

test("bootstrap ranges are deterministic and bracket the sample statistic", () => {
  const text = log("Acme", [8, 14, 22, 11, 19, 30, 9, 16, 12, 25, 18, 13]);
  const a = run(text).clients[0], b = run(text).clients[0];
  assert.deepEqual(a.meanRange80, b.meanRange80);
  assert.deepEqual(a.p80Range80, b.p80Range80);
  assert.ok(a.meanRange80[0] < a.mean && a.mean < a.meanRange80[1]);
  assert.ok(a.p80Range80[0] <= a.p80 + 2 && a.p80Range80[1] >= a.p80 - 2);
  assert.ok(a.underpayRange80[0] <= a.underpayProb && a.underpayProb <= a.underpayRange80[1]);
});

test("hold-out flags a shift in hours and passes a stable history", () => {
  const stable = run(log("Acme", Array(12).fill(20))).clients[0];
  assert.equal(stable.verdict, "usable");
  assert.equal(stable.holdout.trainMonths, 8);
  assert.equal(stable.holdout.testMonths, 4);
  const shifted = run(log("Acme", [10, 10, 10, 10, 10, 10, 10, 10, 30, 30, 30, 30])).clients[0];
  assert.equal(shifted.verdict, "unstable");
  assert.ok(shifted.holdout.gap > 0.25);
  assert.equal(shifted.holdout.testUnderpay, 1); // 30 h * $100 > $1500 every test month
  assert.match(shifted.verdictNote, /up/);
});

test("under nine months there is no hold-out and the verdict is weak", () => {
  const c = run(log("Acme", [10, 12, 9, 11, 10, 13, 12, 10])).clients[0];
  assert.equal(c.holdout, null);
  assert.equal(c.verdict, "weak");
});

test("a known distribution: p80 and coverage are recovered from a long history", () => {
  // Hours uniform on 10..30: true p80 is 26. 200 months, fixed seed.
  const rand = rng(5);
  const hours = Array.from({ length: 200 }, () => 10 + rand() * 20);
  const rows = hours.map((h, i) => ({ day: Date.UTC(2000 + Math.floor(i / 12), i % 12, 15) / 86400000, client: "Sim", hours: h, billed: null }));
  const c = analyze(rows, { rate: 100, retainer: 2000 }).clients[0];
  assert.ok(Math.abs(c.p80 - 26) < 1.2, String(c.p80));
  assert.ok(Math.abs(c.mean - 20) < 1, String(c.mean));
  assert.ok(c.meanRange80[0] < 20.5 && c.meanRange80[1] > 19.5);
  assert.ok(Math.abs(c.underpayProb - 0.5) < 0.1); // hours above 20 underpay a $2000 retainer at $100/h
  assert.ok(c.retainerForTarget > 2400 && c.retainerForTarget < 2800);
});

test("hourly rate can come from the billed column, and is required otherwise", () => {
  const withBill = parseRows(log("Acme", [10, 10, 10, 10, 10, 10], 2025, 1, 90));
  const r = analyze(withBill.rows, { retainer: 1500 });
  assert.equal(r.params.rate, 90);
  assert.equal(r.rateSource, "billed");
  assert.equal(r.billedRate, 90);
  const none = parseRows(log("Acme", [10, 10, 10, 10, 10, 10]));
  assert.match(analyze(none.rows, { retainer: 1500 }).error, /hourly rate/);
});

test("input validation", () => {
  const p = parseRows(log("Acme", [10, 10, 10, 10, 10, 10]));
  assert.ok(analyze(p.rows, { rate: 100 }).error);
  assert.ok(analyze(p.rows, { rate: 100, retainer: -5 }).error);
  assert.ok(analyze(p.rows, { rate: 0, retainer: 100 }).error);
  assert.ok(analyze(p.rows, { rate: 100, retainer: 100, coverage: 1.2 }).error);
  assert.ok(analyze(p.rows, { rate: 100, retainer: 100, target: 0 }).error);
});

test("sample data analyses cleanly and the CSV has a row per client", () => {
  const p = parseRows(sampleText());
  assert.deepEqual(p.warnings, []);
  const r = analyze(p.rows, { rate: 95, retainer: 1800 });
  assert.equal(r.error, undefined);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.clients.length, 3);
  assert.equal(reportCsv(r).trim().split("\n").length, 4);
  assert.equal(monthLabel(2025 * 12), "2025-01");
});

test("calc.mjs has no network or import surface", () => {
  const src = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(src, /^\s*import\s/m);
});
