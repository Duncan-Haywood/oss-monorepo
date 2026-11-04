import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

test("a HELD row (card hold not yet settled) is skipped, SETTLED rows are kept", () => {
  const csv = "Time,Description,Amount,Currency,Status\n2026-03-01 10:00:00,Woolworths,-12.50,AUD,SETTLED\n2026-03-02 09:00:00,Salary,2500.00,AUD,SETTLED\n2026-03-03 09:00:00,Pending coffee,-4.00,AUD,HELD\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 250000]);
  assert.ok(r.problems.some((p) => /held/i.test(p)));
});
