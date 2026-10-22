import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments, importStatement } from "./engine.mjs";
import { salesTaxReturn, dueDate } from "./salestaxreturn.mjs";

const csv = [
  "type,number,date,due,party,amount,account,description",
  "invoice,1,2026-01-10,,A Co,100.00,4000,Goods",
  "invoice,1,2026-01-10,,A Co,6.00,2100,CA state",
  "invoice,1,2026-01-10,,A Co,1.00,2100,LA county",
  "invoice,2,2026-03-31,,B Co,200.00,4000,Goods",
  "invoice,2,2026-03-31,,B Co,12.00,2100,CA state",
  "invoice,3,2026-02-01,,C Co,50.00,4000,Resale exempt",
  "credit note,9,2026-02-15,,A Co,50.00,4000,Return",
  "credit note,9,2026-02-15,,A Co,3.00,2100,CA state",
  "invoice,4,2026-04-02,,D Co,10.00,4000,Goods",
  "invoice,4,2026-04-02,,D Co,0.90,2100,",
].join("\n") + "\n";
const books = () => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books, csv).books;

test("tax is split by jurisdiction and quarter, credits netted, exempt sales kept apart", () => {
  const r = salesTaxReturn(books());
  const q1 = r.periods.find((p) => p.period === "2026-Q1");
  const ca = q1.rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(ca.taxableSales, 25000);
  assert.equal(ca.tax, 1500);
  assert.equal(ca.taxCredited, 300);
  assert.equal(q1.rows.find((x) => x.jurisdiction === "LA county").tax, 100);
  assert.equal(q1.nonTaxableSales, 5000);
  assert.equal(ca.due, "2026-04-20");
});

test("rate check and unlabelled tax lines warn", () => {
  const r = salesTaxReturn(books(), { rates: { "LA county": 0.0225 } });
  assert.ok(r.warnings.some((w) => /LA county.*1\.00%.*2\.25%/.test(w)));
  assert.ok(r.warnings.some((w) => /no description/.test(w)));
});

test("monthly frequency and December rolls into January", () => {
  assert.equal(salesTaxReturn(books(), { frequency: "monthly" }).periods[0].period, "2026-01");
  assert.equal(dueDate("2026-12", 25), "2027-01-25");
  assert.equal(dueDate("2026-Q4"), "2027-01-20");
  assert.throws(() => salesTaxReturn(books(), { frequency: "weekly" }));
});
