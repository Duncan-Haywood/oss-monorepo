import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseMoney, monthOffset, whatIf, requestLetter, reportCsv, sampleInput, money, projectYear } from "./calc.mjs";

const base = (over = {}) => ({ startMonth: 1, items: [{ name: "Tax", amount: "1200", month: 12 }], startBalance: "0", ...over });

test("parseMoney reads dollars, commas, parentheses and rejects other shapes", () => {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(50)"), -50);
  assert.equal(parseMoney("-12"), -12);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("1.234,50"), null);
  assert.equal(parseMoney("12abc"), null);
});

test("monthOffset counts from the first month of the escrow year", () => {
  assert.equal(monthOffset(1, 1), 1);
  assert.equal(monthOffset(12, 11), 12);
  assert.equal(monthOffset(12, 12), 1);
  assert.equal(monthOffset(6, 5), 12);
});

test("one bill in the last month with an empty account needs the cushion", () => {
  const a = analyze(base());
  assert.equal(a.summary.monthly, 100);
  assert.equal(a.summary.cushionMax, 200);
  assert.equal(a.summary.needed, 200);
  assert.equal(a.summary.shortage, 200);
  assert.equal(a.summary.deficiency, 0);
  assert.equal(a.summary.expectedPayment, 116.67);
  assert.equal(a.summary.paymentAfterShortage, 100);
});

test("a bill in the first month makes a large required starting balance and a deficiency", () => {
  const a = analyze(base({ items: [{ name: "Tax", amount: "1200", month: 1 }] }));
  assert.equal(a.summary.needed, 1300);
  assert.equal(a.summary.shortage, 1300);
  assert.equal(a.summary.deficiency, 1100);
  assert.equal(a.summary.shortageOnly, 200);
});

test("a large start balance is a surplus", () => {
  const a = analyze(base({ startBalance: "500" }));
  assert.equal(a.summary.shortage, 0);
  assert.equal(a.summary.surplus, 300);
  assert.ok(a.findings.some((f) => f.id === "surplus"));
});

test("balance projection ends at start balance plus deposits less bills", () => {
  const a = analyze(base({ startBalance: "350" }));
  assert.equal(a.rows.length, 12);
  assert.equal(a.rows[11].closing, 350);
  assert.equal(a.rows[0].opening, 350);
  assert.equal(a.rows[11].disbursement, 1200);
});

test("the projection puts the calendar months in escrow-year order", () => {
  const a = analyze(base({ startMonth: 12, items: [{ name: "Tax", amount: "1200", month: 11 }] }));
  assert.equal(a.rows[0].month, "December");
  assert.equal(a.rows[11].month, "November");
  assert.equal(a.rows[11].disbursement, 1200);
});

test("cushion above one-sixth is flagged with the excess", () => {
  const a = analyze(base({ statedCushion: "300" }));
  const f = a.findings.find((x) => x.id === "cushion");
  assert.ok(f);
  assert.equal(f.severity, "high");
  assert.equal(f.amountCents, 10000);
  assert.equal(analyze(base({ statedCushion: "200" })).findings.some((x) => x.id === "cushion"), false);
});

test("a payment above what the numbers support is flagged, one within a dollar is not", () => {
  const a = analyze(base({ statedPayment: "160" }));
  const f = a.findings.find((x) => x.id === "payment");
  assert.ok(f);
  assert.equal(f.amountCents, Math.round((160 - 116.67) * 100) * 12);
  assert.equal(analyze(base({ statedPayment: "117" })).findings.some((x) => x.id === "payment"), false);
  assert.equal(analyze(base({ statedPayment: "90" })).findings.some((x) => x.id === "payment"), false);
});

test("servicer projecting more yearly bills than entered is flagged with the monthly effect", () => {
  const a = analyze(base({ statedAnnual: "1500" }));
  const f = a.findings.find((x) => x.id === "annual");
  assert.ok(f);
  assert.equal(f.amountCents, 30000);
  assert.match(f.detail, /\$8\.33/);
});

test("stated shortage above the computed one is flagged", () => {
  const f = analyze(base({ statedShortage: "500" })).findings.find((x) => x.id === "shortage");
  assert.ok(f);
  assert.equal(f.amountCents, 30000);
});

test("shortage spread over under 12 months is high when the shortage is at least a month's payment", () => {
  const a = analyze(base({ startBalance: "0", statedShortage: "200", statedShortageMonthly: "50" }));
  const f = a.findings.find((x) => x.id === "spread");
  assert.ok(f);
  assert.equal(f.severity, "high");
  assert.match(f.title, /4\.0 months/);
});

test("a shortage under one month's payment may be collected in 30 days, so no spread flag", () => {
  const a = analyze(base({ startBalance: "150", statedShortage: "50", statedShortageMonthly: "50" }));
  assert.equal(a.findings.some((x) => x.id === "spread"), false);
});

test("a deficiency is not held to the 12-month rule", () => {
  const a = analyze(base({ items: [{ name: "Tax", amount: "1200", month: 1 }], startBalance: "0", statedShortage: "1300", statedShortageMonthly: "1300" }));
  assert.equal(a.findings.some((x) => x.id === "spread"), false);
  assert.ok(a.findings.some((x) => x.id === "spread-def"));
});

test("surplus is not raised as a refund due when the borrower is not current", () => {
  const a = analyze(base({ startBalance: "500", current: "no" }));
  assert.equal(a.findings.some((x) => x.id === "surplus"), false);
});

test("amount in question adds flagged items only and skips information", () => {
  const a = analyze(base({ statedPayment: "160", statedCushion: "300", oldPayment: "100" }));
  assert.ok(a.findings.some((x) => x.id === "change" && x.severity === "info"));
  const sum = a.findings.filter((f) => f.severity !== "info").reduce((s, f) => s + f.amountCents, 0);
  assert.equal(a.summary.questioned, sum / 100);
});

test("bad and missing inputs give a message, not a result", () => {
  assert.match(analyze({ startMonth: 1, items: [], startBalance: "5" }).error, /at least one yearly escrow item/);
  assert.match(analyze(base({ startBalance: "" })).error, /projected escrow balance/);
  assert.match(analyze(base({ startMonth: 0 })).error, /month the new escrow year starts/);
  assert.match(analyze(base({ items: [{ name: "Tax", amount: "abc", month: 3 }] })).error, /not a number/);
  assert.match(analyze(base({ statedPayment: "x" })).error, /new escrow payment/);
});

test("blank item rows are ignored", () => {
  const a = analyze(base({ items: [{ name: "Tax", amount: "1200", month: 12 }, { name: "", amount: "", month: 3 }] }));
  assert.equal(a.items.length, 1);
});

test("whatIf shows a $600 insurance drop as $50 a month", () => {
  const input = { startMonth: 1, items: [{ name: "Insurance", amount: "2400", month: 6 }, { name: "Tax", amount: "3600", month: 11 }], startBalance: "1000" };
  const w = whatIf(input, "Insurance", "1800");
  assert.equal(w.monthlyBefore, 500);
  assert.equal(w.monthlyAfter, 450);
  assert.equal(w.monthlyChange, -50);
  assert.equal(w.yearlyChange, -600);
});

test("the sample raises the cushion, payment, annual and spread findings", () => {
  const a = analyze(sampleInput());
  const ids = a.findings.map((f) => f.id);
  for (const id of ["cushion", "annual", "payment", "spread"]) assert.ok(ids.includes(id), id);
  assert.equal(a.summary.annual, 8400);
});

test("the letter asks questions, cites Regulation X, and never accuses", () => {
  const a = analyze(sampleInput());
  const t = requestLetter(a, { name: "A Homeowner", loan: "123", servicer: "Example Servicer", date: "2026-09-29" });
  assert.match(t, /escrow account analysis worksheet/);
  assert.match(t, /Regulation X/);
  assert.match(t, /Loan 123/);
  assert.doesNotMatch(t, /illegal|violat|fraud|overcharg|steal/i);
});

test("CSV export has the schedule and the findings", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv, /^month,opening_balance/);
  assert.match(csv, /severity,finding,amount_in_question/);
  assert.equal(csv.split("\n").filter((l) => /^(January|February|March|April|May|June|July|August|September|October|November|December),/.test(l)).length, 12);
});

test("projectYear low point matches the hand calculation", () => {
  const p = projectYear([{ name: "x", amountCents: 120000, dueMonth: 1 }], 10000, 0, 1);
  assert.equal(p.minCumCents, -110000);
  assert.equal(p.endCents, 0);
});

test("money formats cents", () => {
  assert.equal(money(1234.5), "1,234.50");
  assert.equal(money(0.005), "0.01");
});
