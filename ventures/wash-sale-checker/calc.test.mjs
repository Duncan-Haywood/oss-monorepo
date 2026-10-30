import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTrades, analyze, evaluate, sampleList, reportCsv, safeRebuyDate, isoDate, money } from "./calc.mjs";

const csv = (...rows) => ["Date,Symbol,Action,Quantity,Price,Account", ...rows].join("\n");

test("parseDate reads ISO and US dates and rejects impossible ones", () => {
  assert.equal(isoDate(parseDate("2025-03-09")), "2025-03-09");
  assert.equal(isoDate(parseDate("3/9/2025")), "2025-03-09");
  assert.equal(parseDate("2025-02-30"), null);
  assert.equal(parseDate("hello"), null);
});

test("a loss with no nearby repurchase is fully allowed", () => {
  const r = evaluate(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"));
  assert.equal(r.summary.grossLoss, 200);
  assert.equal(r.summary.disallowed, 0);
  assert.equal(r.summary.allowed, 200);
});

test("repurchase 30 days after the sale washes the loss, 31 days does not", () => {
  const base = ["2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"];
  assert.equal(evaluate(csv(...base, "2025-07-01,AAPL,buy,10,81,Taxable")).summary.disallowed, 200);
  assert.equal(evaluate(csv(...base, "2025-07-02,AAPL,buy,10,81,Taxable")).summary.disallowed, 0);
});

test("a purchase 30 days BEFORE the sale also counts, and the sold lot itself does not", () => {
  const r = evaluate(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-05-02,AAPL,buy,10,90,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"));
  // FIFO sells the January lot (loss 200); the May 2 buy is 30 days earlier -> wash
  assert.equal(r.summary.disallowed, 200);
});

test("partial replacement disallows the loss proportionally", () => {
  const r = evaluate(csv("2025-01-02,TSLA,buy,50,250,Taxable", "2025-12-05,TSLA,sell,50,210,Taxable", "2025-12-20,TSLA,buy,30,215,Taxable"));
  assert.equal(r.summary.disallowed, 1200);
  assert.equal(r.summary.allowed, 800);
});

test("replacement bought in an IRA makes the loss permanent", () => {
  const r = evaluate(csv("2025-01-02,NVDA,buy,100,120,Taxable", "2025-11-14,NVDA,sell,100,95,Taxable", "2025-11-26,NVDA,buy,100,98,Roth IRA"));
  assert.equal(r.summary.disallowed, 2500);
  assert.equal(r.summary.permanent, 2500);
  assert.equal(r.summary.deferred, 0);
});

test("disallowed loss is added to the basis of the replacement shares and flows to a later sale", () => {
  const r = evaluate(csv("2025-01-02,X,buy,10,100,Taxable", "2025-03-01,X,sell,10,80,Taxable", "2025-03-10,X,buy,10,82,Taxable", "2025-09-01,X,sell,10,95,Taxable"));
  const [first, second] = r.sales;
  assert.equal(first.disallowed, 200);
  // second lot basis 820 + 200 carried = 1020, proceeds 950 -> loss 70, no replacement nearby
  assert.equal(second.basis, 1020);
  assert.equal(second.gain, -70);
});

test("a gain is never washed, and different symbols never match", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,10,Taxable", "2025-03-01,A,sell,10,20,Taxable", "2025-03-05,A,buy,10,20,Taxable", "2025-04-01,B,buy,10,5,Taxable"));
  assert.equal(r.summary.disallowed, 0);
  assert.equal(r.summary.lossSales, 0);
});

test("one replacement purchase is not counted against two sales", () => {
  const r = evaluate(csv("2025-01-02,A,buy,20,100,Taxable", "2025-03-01,A,sell,10,90,Taxable", "2025-03-05,A,sell,10,90,Taxable", "2025-03-10,A,buy,10,90,Taxable"));
  assert.equal(r.summary.disallowed, 100);
});

test("an explicit basis column overrides FIFO", () => {
  const t = parseTrades("Date,Symbol,Action,Quantity,Price,Cost basis\n2025-03-01,A,sell,10,80,1000").trades;
  const r = analyze(t);
  assert.equal(r.sales[0].gain, -200);
});

test("sells with no earlier buy are flagged, not silently invented", () => {
  const r = evaluate("Date,Symbol,Action,Quantity,Price\n2025-03-01,A,sell,10,80");
  assert.match(r.notes.join(" "), /no earlier purchase/);
});

test("sales inside an IRA are skipped with a note", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,100,IRA", "2025-03-01,A,sell,10,80,IRA"));
  assert.equal(r.sales.length, 0);
  assert.match(r.notes.join(" "), /IRA/);
});

test("bad rows are reported with their line number", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,100,Taxable", "nope,A,sell,10,80,Taxable"));
  assert.match(r.errors[0], /Line 3/);
});

test("missing columns give a clear error", () => {
  assert.match(parseTrades("a,b\n1,2").error, /Need columns/);
});

test("amount column can stand in for price, and quoted fields parse", () => {
  const t = parseTrades('Date,Symbol,Action,Quantity,Amount\n"2025-01-02","A",Buy,"10","$1,000.00"').trades;
  assert.equal(t[0].price, 100);
});

test("the sample list produces a mix of permanent, deferred and clean results", () => {
  const r = evaluate(sampleList());
  assert.equal(r.summary.washed, 2);
  assert.equal(r.summary.permanent, 1500);
  assert.equal(r.summary.deferred, 1200);
});

test("report CSV carries the Form 8949 code W column and safe date is 31 days on", () => {
  const r = evaluate(sampleList());
  assert.match(reportCsv(r), /Form 8949 code W/);
  assert.equal(isoDate(safeRebuyDate(parseDate("2025-11-14"))), "2025-12-15");
  assert.equal(money(-1234.5), "-$1,234.50");
});

test("price may be the first column, and net gain is the exact sum of every sale", () => {
  const r = evaluate(["Price,Date,Symbol,Action,Quantity", "100,2025-01-02,AAPL,buy,10", "80,2025-06-01,AAPL,sell,10", "130,2025-07-01,MSFT,sell,1"].join("\n"));
  assert.ok(!r.error);
  assert.equal(r.summary.netGain, -200 + 130);
  const only = evaluate(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,100,Taxable"));
  assert.equal(only.summary.netGain, 0);
});

test("a basis column only attaches to sells, and a blank sell basis stays null", () => {
  const p = parseTrades(["Date,Symbol,Action,Quantity,Price,Basis", "2025-01-02,AAPL,buy,10,100,999", "2025-06-01,AAPL,sell,10,80,", "2025-06-02,AAPL,sell,1,80,50"].join("\n"));
  assert.deepEqual(p.trades.map((t) => t.basis), [null, null, 50]);
  const noCol = parseTrades(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"));
  assert.deepEqual(noCol.trades.map((t) => t.basis), [null, null]);
});
