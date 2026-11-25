import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, toCsv, csvCell, summaryText, SAMPLE, fmt, toCents } from "./calc.mjs";

// Hand calculation of SAMPLE (10% retainage on work and on stored materials):
//   line   C        D       E       F       G=D+E+F  H=C-G   retainage
//   1      12,000   6,000   2,000   0        8,000    4,000     800
//   2      40,000  20,000  10,000   0       30,000   10,000   3,000
//   3      60,000   9,000   6,000  15,000   30,000   30,000   1,500 + 1,500
//   4      38,000   0       7,600   0        7,600   30,400     760
//   CO-1    8,500   0       4,250   0        4,250    4,250     425
// original 150,000; change orders 8,500; contract sum 158,500
// completed and stored 79,850; retainage 7,985; earned less retainage 71,865
// previous certificates 31,500 (= 35,000 previous work less 10%)
// current payment due 40,365; balance to finish 78,650; plus retainage 86,635
test("the sample matches the hand calculation", () => {
  const { totals: t, findings } = compute(SAMPLE.lines, SAMPLE.settings);
  assert.equal(t.originalContractSum, 15_000_000);
  assert.equal(t.netChangeOrders, 850_000);
  assert.equal(t.contractSumToDate, 15_850_000);
  assert.equal(t.completedStored, 7_985_000);
  assert.equal(t.retainageOnWork, 648_500);
  assert.equal(t.retainageOnStored, 150_000);
  assert.equal(t.retainageHeld, 798_500);
  assert.equal(t.earnedLessRetainage, 7_186_500);
  assert.equal(t.currentPaymentDue, 4_036_500);
  assert.equal(t.balanceToFinish, 7_865_000);
  assert.equal(t.balanceToFinishPlusRetainage, 8_663_500);
  assert.deepEqual(findings, []);
});

test("per-line columns: G, H, percent and retainage", () => {
  const { rows } = compute(SAMPLE.lines, SAMPLE.settings);
  const sw = rows.find((r) => r.item === "3");
  assert.equal(sw.G, 3_000_000);
  assert.equal(sw.H, 3_000_000);
  assert.equal(sw.pct, 0.5);
  assert.equal(sw.retainage, 300_000);
  assert.equal(rows.find((r) => r.item === "CO-1").changeOrder, true);
});

test("a lower rate on stored materials and a release reduce retainage held", () => {
  const { totals: t } = compute(SAMPLE.lines, { ...SAMPLE.settings, storedRetainage: "0", retainageReleased: "1000" });
  // 6,485 on work + 0 on stored - 1,000 released = 5,485
  assert.equal(t.retainageHeld, 548_500);
  assert.equal(t.currentPaymentDue, 7_985_000 - 548_500 - 3_150_000);
});

test("over-billing a line, and releasing more than is held, are flagged", () => {
  const lines = [{ item: "1", description: "Paint", scheduled: "1000", previous: "900", thisPeriod: "200", stored: "0" }];
  const { findings } = compute(lines, { workRetainage: "5", retainageReleased: "500" });
  assert.ok(findings.some((f) => f.level === "high" && /billed \$1,100\.00 against/.test(f.msg)));
  assert.ok(findings.some((f) => /Retainage released/.test(f.msg)));
});

test("bad numbers and rates are reported, not silently zeroed", () => {
  const { findings } = compute([{ item: "1", description: "x", scheduled: "abc" }], { workRetainage: "150" });
  assert.ok(findings.some((f) => /could not be read/.test(f.msg)));
  assert.ok(findings.some((f) => /between 0% and 100%/.test(f.msg)));
});

test("money parsing tolerates $ and commas and keeps cents exact", () => {
  assert.equal(toCents("$1,234.56"), 123_456);
  assert.equal(toCents("0.1") + toCents("0.2"), 30);
  assert.equal(fmt(-123_456), "-$1,234.56");
  assert.equal(toCents("29,99"), 2_999);
  assert.equal(toCents("1.234,56"), 123_456);
  assert.ok(Number.isNaN(toCents("1,2,3")));
});

test("CSV and summary carry the totals", () => {
  const r = compute(SAMPLE.lines, SAMPLE.settings);
  const csv = toCsv(r);
  assert.match(csv.split("\n")[0], /^Item,Description,Scheduled value/);
  assert.match(csv, /,Totals,158500\.00,35000\.00,29850\.00,15000\.00,79850\.00,50\.4,78650\.00,7985\.00/);
  assert.match(summaryText(r), /CURRENT PAYMENT DUE \(6 - 7\)\.+ \$40,365\.00/);
});

test("CSV cells that look like formulas are neutralised, numbers are not", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell("-1200.00"), "-1200.00");
  assert.equal(csvCell("a,b"), '"a,b"');
});

import { quickbooksLines } from "./calc.mjs";

test("QuickBooks lines: retainage is a negative line, release a positive one", () => {
  // Pay app 1 of the guide: $40,000 billed, 10% held -> invoice $36,000.
  const a = quickbooksLines({ billed: "40,000", rate: "10" });
  assert.deepEqual(a.lines.map((l) => l.amount), [4_000_000, -400_000]);
  assert.equal(a.total, 3_600_000);
  assert.equal(a.retainageChange, 400_000);
  // Release invoice: nothing new billed, $15,000 released.
  const c = quickbooksLines({ billed: "0", released: "15000" });
  assert.deepEqual(c.lines.map((l) => l.amount), [1_500_000]);
  assert.equal(c.total, 1_500_000);
  assert.equal(c.retainageChange, -1_500_000);
  // Held typed directly wins over the rate (e.g. stored materials at another rate).
  assert.equal(quickbooksLines({ billed: "1000", rate: "10", held: "50" }).total, 95_000);
  // Rounds to the cent.
  assert.equal(quickbooksLines({ billed: "333.33", rate: "5" }).lines[1].amount, -1_667);
  assert.ok(quickbooksLines({ billed: "x", rate: "150" }).errors.length === 2);
});
