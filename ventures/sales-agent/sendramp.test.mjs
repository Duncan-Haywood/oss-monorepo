import test from "node:test";
import assert from "node:assert/strict";
import { plan, toCsv } from "./sendramp.mjs";

test("one mailbox ramps 10 -> 40 in steps of 5 every 3 days", () => {
  const r = plan({ mailboxes: 1, targetPerDay: 40 });
  assert.equal(r.schedule[0].total, 10);
  assert.equal(r.schedule[3].total, 15);
  assert.equal(r.schedule[6].total, 20);
  assert.equal(r.daysToTarget, 19);
  assert.equal(r.finalPerDay, 40);
});
test("three mailboxes reach 90/day and day totals never exceed target", () => {
  const r = plan({ mailboxes: 3, targetPerDay: 90 });
  assert.ok(r.schedule.every((x) => x.total <= 90));
  assert.equal(r.finalPerDay, 90);
  assert.equal(r.schedule[0].total, 30);
});
test("a target above mailboxes x cap warns and says how many mailboxes", () => {
  const r = plan({ mailboxes: 2, targetPerDay: 200 });
  assert.equal(r.reachedTarget, false);
  assert.equal(r.daysToTarget, null);
  assert.equal(r.finalPerDay, 80);
  assert.ok(r.warnings[0].includes("at least 5 mailboxes"));
});
test("cumulative adds up and csv has a row per day", () => {
  const r = plan({ mailboxes: 2, targetPerDay: 50 });
  assert.equal(r.schedule.reduce((a, x) => a + x.total, 0), r.schedule.at(-1).cumulative);
  assert.equal(toCsv(r).trim().split("\n").length, r.schedule.length + 1);
});
test("bad input throws; zero warm days drops the warm-up note", () => {
  assert.throws(() => plan({ mailboxes: 0, targetPerDay: 10 }));
  assert.throws(() => plan({ mailboxes: 1 }));
  assert.ok(!plan({ mailboxes: 1, targetPerDay: 10, warmDays: 0 }).warnings.some((w) => /warm-up traffic/.test(w)));
});
test("start above cap is clamped to cap", () => {
  const r = plan({ mailboxes: 1, targetPerDay: 100, startPerDay: 90, capPerMailbox: 30 });
  assert.equal(r.schedule[0].total, 30);
});
