import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backtestSales } from "./demand.mjs";

// Hand-built sales in the French bakery's shape: open 9:00-19:00 every day, shut 13:00-15:00 for lunch except a stray
// sale on 1 date in 10, and a quiet 17:00 that still trades on 2 dates in 5 (open, just slow). 40 weeks, so the break rule
// (20 dates of a weekday) has half the tested weeks to act in.
function sales() {
  const rows = ["datetime,sales"];
  const t0 = Date.UTC(2026, 0, 5);
  for (let d = 0; d < 40 * 7; d++) {
    const date = new Date(t0 + d * 864e5).toISOString().slice(0, 10);
    for (let h = 9; h < 19; h++) {
      let v = 70;
      if (h === 13 || h === 14) { if (d % 10) continue; v = 5; }
      if (h === 17) { if (d % 5 > 1) continue; v = 10; }
      rows.push(`${date} ${String(h).padStart(2, "0")}:00,${v}`);
    }
  }
  return rows.join("\n");
}
const o = { splh: 60, minStaff: 1, shifts: true };

test("score-closed: a staffed lunch closure now counts as over; the plan that shuts it is scored as before", () => {
  const text = sales();
  const all = (b) => b.methods[0];
  const offOld = all(backtestSales(text, { ...o, keepRare: true })), offNew = all(backtestSales(text, { ...o, keepRare: true, scoreClosed: true }));
  const onOld = all(backtestSales(text, o)), onNew = all(backtestSales(text, { ...o, scoreClosed: true }));
  // Rules off staffs 13:00 and 14:00 with minimum staff every day. Old score: needed, never over. New score: over on
  // the 9 in 10 dates with no sale then, 2 hours x 7 days x 0.9 = 12.6 a week (whole weeks shift it by a little).
  assert.equal(offOld.scheduled, offNew.scheduled);
  const added = offNew.over - offOld.over;
  assert.ok(added > 11.5 && added < 13.5, `over rose by ${added}`);
  // Rules on shuts the closure once a weekday has 20 dates to learn from (the break rule's minimum), so only its first
  // weeks are charged: far less added over. The quiet 17:00 trades on 2 in 5 dates, so it is an open hour and minimum
  // staff is still needed there (short is unchanged).
  const addedOn = onNew.over - onOld.over;
  assert.ok(addedOn >= 0 && addedOn < added / 2, `rules on: over rose by ${addedOn}`);
  assert.equal(onNew.short, onOld.short);
  const late = (b) => b.perWeek.all.slice(-3);
  assert.deepEqual(late(backtestSales(text, { ...o, scoreClosed: true })), late(backtestSales(text, o)));
  // Under the old score shutting the closure only looked worse (short on the stray-sale dates); now it wins.
  assert.ok(onOld.miss > offOld.miss, `old: rules on ${onOld.miss} vs off ${offOld.miss}`);
  assert.ok(onNew.miss < offNew.miss, `new: rules on ${onNew.miss} vs off ${offNew.miss}`);
});

test("score-closed: the CLI flag reaches the backtest and the report says so", () => {
  const dir = mkdtempSync(join(tmpdir(), "score-closed-"));
  const f = join(dir, "sales.csv");
  writeFileSync(f, sales());
  const out = execFileSync("node", ["cli.mjs", "--from-sales", f, "--splh", "60", "--backtest", "--score-closed", "--keep-rare"], { cwd: import.meta.dirname, encoding: "utf8" });
  assert.match(out, /only in hours your shop normally trades/);
  const plain = execFileSync("node", ["cli.mjs", "--from-sales", f, "--splh", "60", "--backtest", "--keep-rare"], { cwd: import.meta.dirname, encoding: "utf8" });
  assert.doesNotMatch(plain, /only in hours your shop normally trades/);
});
