import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, subsFromCsv, sampleCsv } from "./csv.mjs";
import { backfill, summarize } from "./metrics.mjs";

test("parseCsv handles quotes, embedded commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("reads a Stripe-style export by header name in any order", () => {
  const { subs, skipped } = subsFromCsv("Created (UTC),id,Status,Interval,Amount,Quantity,Canceled At (UTC)\n2026-01-05 10:00,sub_1,canceled,month,\"1,200.50\",2,2026-03-01\n2026-02-01,sub_2,active,year,120,,\n");
  assert.equal(skipped.length, 0);
  assert.equal(subs[0].mrr, 240100);
  assert.equal(subs[0].endedAt, Date.UTC(2026, 2, 1));
  assert.equal(subs[1].mrr, 1000);
  assert.equal(subs[1].endedAt, null);
});

test("bad rows are skipped with a reason, not guessed", () => {
  const { subs, skipped } = subsFromCsv("id,amount,interval,created\na,abc,month,2026-01-01\nb,10,fortnight,2026-01-01\nc,10,month,not a date\nd,10,month,2026-01-01\n");
  assert.equal(subs.length, 1);
  assert.deepEqual(skipped.map((s) => s.line), [2, 3, 4]);
});

test("missing required columns are named", () => {
  assert.deepEqual(subsFromCsv("id,status\na,active").missing, ["amount", "interval", "created"]);
});

test("the sample data produces a believable dashboard", () => {
  const now = Date.UTC(2026, 9, 15);
  const { subs, skipped } = subsFromCsv(sampleCsv(now));
  assert.equal(skipped.length, 0);
  const s = summarize(backfill(subs, now, 12).months);
  assert.ok(s.mrr > 100000 && s.customers > 50, JSON.stringify(s));
});
