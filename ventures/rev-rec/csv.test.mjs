import { test } from "node:test";
import assert from "node:assert/strict";
import { linesFromCsv, sampleCsv, parseCsv } from "./csv.mjs";
import { schedule } from "./revrec.mjs";

test("reads Stripe-style headers in any order, parentheses as negatives", () => {
  const r = linesFromCsv('Period End,amount,Date (UTC),Period Start,id\n2027-01-01,"1,200.00",2026-01-01,2026-01-01,il_1\n2026-02-10,(25.00),2026-02-10,2026-02-10,cn_1');
  assert.equal(r.skipped.length, 0);
  assert.equal(r.lines[0].amount, 120000);
  assert.equal(r.lines[1].amount, -2500);
});

test("missing columns and bad rows are reported, not guessed", () => {
  assert.deepEqual(linesFromCsv("id,amount\n1,5").missing, ["billed", "start"]);
  const r = linesFromCsv("amount,date,period start,period end\nabc,2026-01-01,2026-01-01,2026-02-01\n5,nope,2026-01-01,2026-02-01\n5,2026-01-01,2026-03-01,2026-02-01\n5,2026-01-01,2026-01-01,");
  assert.deepEqual(r.skipped.map((s) => s.why), ["amount is not a number", "billing date is not a date", "period end is before period start"]);
  assert.equal(r.lines.length, 1);
});

test("quoted commas and CRLF parse", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y",2\r\n'), [["a", "b"], ["x,y", "2"]]);
});

test("sample data parses cleanly and the schedule always rolls forward", () => {
  const r = linesFromCsv(sampleCsv());
  assert.equal(r.skipped.length, 0);
  assert.ok(r.lines.length > 100);
  const rows = schedule(r.lines, { asOf: Date.UTC(2026, 9, 15) });
  for (const x of rows) assert.equal(x.opening + x.billed - x.recognized, x.closing);
  assert.ok(rows.at(-1).closing === 0, "every demo term ends in the future window");
});
