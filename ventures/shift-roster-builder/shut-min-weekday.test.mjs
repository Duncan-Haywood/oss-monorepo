// A shut-hour minimum by weekday (2026-11-12): two closers on late Fridays and Saturdays only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demandShifts, backtestSales, readSales, shutMinDays, shutMinOf } from "./demand.mjs";

// Six weeks of a shop open 9:00-13:00 on Mondays and Fridays, one ticket an hour.
const MON_FRI = (() => {
  const rows = ["date,time,ticket"];
  for (let w = 0; w < 6; w++) for (const off of [0, 4]) {
    const d = new Date(Date.UTC(2026, 9, 5 + 7 * w + off)).toISOString().slice(0, 10);
    for (const h of [9, 10, 11, 12]) rows.push(`${d},${h}:10,${w}-${off}-${h}`);
  }
  return rows.join("\n");
})();

test("shutMinDays reads one number, weekday entries and arrays", () => {
  assert.deepEqual(shutMinDays({}), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(shutMinDays({ minStaff: 0 }), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(shutMinDays({ shutMin: 2 }), [2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(shutMinDays({ shutMin: "2" }), [2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(shutMinDays({ shutMin: "1, Fri/Sat=2" }), [1, 1, 1, 1, 2, 2, 1]);
  assert.deepEqual(shutMinDays({ shutMin: "Fri-Sun=2" }), [1, 1, 1, 1, 2, 2, 2]);
  assert.deepEqual(shutMinDays({ shutMin: "fri:2; sat 3" }), [1, 1, 1, 1, 2, 3, 1]);
  assert.deepEqual(shutMinDays({ shutMin: "daily=2, Sun=1" }), [2, 2, 2, 2, 2, 2, 1]); // a later entry wins
  assert.deepEqual(shutMinDays({ shutMin: "Fri=2", minStaff: 0 }), [0, 0, 0, 0, 2, 0, 0]);
  assert.deepEqual(shutMinDays({ shutMin: [1, 1, 1, 1, 2, 2, 0] }), [1, 1, 1, 1, 2, 2, 0]);
  assert.equal(shutMinOf({ shutMin: "1, Fri=2" }), 2);
  assert.equal(shutMinOf({ shutMin: "1, Fri=2" }, 0), 1);
  assert.throws(() => shutMinDays({ shutMin: "Fry=2" }), /could not read the day in "Fry=2"/);
  assert.throws(() => shutMinDays({ shutMin: "Fri=1.5" }), /doors shut must be a whole number/);
  assert.throws(() => shutMinDays({ shutMin: "two" }), /doors shut must be a whole number/);
  assert.throws(() => shutMinDays({ shutMin: [1, 2] }), /needs 7 numbers/);
});

test("Friday's two closers clear 90 minutes in one hour; Monday's one stays two hours", () => {
  const r = readSales(MON_FRI, { standard: "1/ticket + 90/after-close", shutMin: "1, Fri=2" });
  const at = (key) => r.entries.filter((e) => e.fixed && e.key === key).map((e) => [e.hour, e.amount]);
  assert.deepEqual(at("2026-10-5"), [[13, 60], [14, 30]]); // Monday
  assert.deepEqual(at("2026-10-9"), [[13, 90]]); // Friday
});

test("the plan puts a second closer on Friday only, and the priced cut keeps it", () => {
  const plan = (o) => demandShifts(MON_FRI, { standard: "1/ticket + 45/after-close", splh: 60, minShift: 4, maxShift: 8, halfLife: "none", ...o });
  const heads13 = (r, d) => r.days[d].shifts.filter(([a, b]) => a <= 13 && b > 13).length;
  const one = plan({}), fri = plan({ shutMin: "1, Fri=2" }), all = plan({ shutMin: 2 });
  assert.deepEqual([heads13(one, 0), heads13(one, 4)], [1, 1]);
  assert.deepEqual([heads13(fri, 0), heads13(fri, 4)], [1, 2]);
  assert.deepEqual([heads13(all, 0), heads13(all, 4)], [2, 2]);
  assert.deepEqual([heads13(plan({ shutMin: "1, Fri=2", shortCost: 0.2 }), 4)], [2]); // a rule, not a cost
  // Friday-only costs one 4-hour shift a week less than two every night.
  assert.equal(all.scheduled - fri.scheduled, 4);
});

test("the backtest scores each weekday at its own shut-hour minimum: a steady shop is never short or over", () => {
  for (const shutMin of ["1, Fri=2", "Mon=2", [1, 1, 1, 1, 2, 1, 1]]) {
    const b = backtestSales(MON_FRI, { standard: "1/ticket + 45/after-close", splh: 30, minStaff: 1, shutMin, minShift: 1, warmup: 1, shifts: true });
    assert.ok(b.weeks > 0);
    assert.equal(b.methods[0].short, 0, String(shutMin)); assert.equal(b.methods[0].over, 0, String(shutMin));
  }
  // Planned at one closer but scored at two on Friday would be short: the scorer reads the same setting.
  const b2 = backtestSales(MON_FRI, { standard: "1/ticket + 45/after-close", splh: 30, minStaff: 1, shutMin: "1, Fri=2", minShift: 1, warmup: 1, shifts: true });
  const b1 = backtestSales(MON_FRI, { standard: "1/ticket + 45/after-close", splh: 30, minStaff: 1, minShift: 1, warmup: 1, shifts: true });
  assert.equal(b2.methods[0].scheduled - b1.methods[0].scheduled, 1); // one more person-hour a week, Friday 13:00
});

test("CLI --shut-min takes weekday entries and explains a bad one", () => {
  const dir = mkdtempSync(join(tmpdir(), "srb-shutwd-"));
  const f = join(dir, "s.csv");
  writeFileSync(f, MON_FRI);
  const run = (...a) => execFileSync(process.execPath, ["cli.mjs", "--from-sales", f, "--standard", "1/ticket + 45/after-close", "--min-shift", "1", "--half-life", "none", ...a], { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const out = run("--shut-min", "1, Fri=2");
  assert.match(out, /Fri, 13:00, 14:00, 1/);
  assert.doesNotMatch(out, /Mon[^\n]*, 13:00, 14:00, 1/);
  assert.throws(() => run("--shut-min", "Fry=2"), (e) => /could not read the day/.test(String(e.stderr)));
});
