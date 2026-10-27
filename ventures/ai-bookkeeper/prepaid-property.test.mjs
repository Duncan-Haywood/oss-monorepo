// Property test for the prepaid schedule: seeded random items (made up, no outside
// data). Invariants: the monthly amounts add up to the cents paid, none is zero or
// negative, months run consecutively at month end, the schedule through a date is a
// prefix of the full one, and what is expensed plus what remains equals the amount.
import test from "node:test";
import assert from "node:assert/strict";
import { prepaidSchedule, prepaidRegister } from "./prepaid.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("prepaidSchedule holds its invariants on 1000 random items", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 1000; i++) {
    const p = { id: "PP-1", name: "x", date: `${pick(2020, 2030)}-${String(pick(1, 12)).padStart(2, "0")}-${String(pick(1, 28)).padStart(2, "0")}`, cents: r() < 0.2 ? pick(1, 70) : pick(1, 50_000_000), months: pick(2, 60), expenseAccount: "6030" };
    const tag = JSON.stringify(p), s = prepaidSchedule(p);
    assert.equal(s.reduce((a, x) => a + x.cents, 0), p.cents, tag);
    assert.equal(s.at(-1).accumulated, p.cents, tag);
    let acc = 0, prevMonth = null;
    for (const x of s) {
      assert.ok(x.cents > 0, tag);
      acc += x.cents;
      assert.equal(x.accumulated, acc, tag);
      assert.ok(prevMonth === null || x.date > prevMonth, tag);
      const d = new Date(x.date + "T00:00:00Z");
      assert.equal(new Date(d.getTime() + 864e5).getUTCDate(), 1, "month end " + tag);
      prevMonth = x.date;
    }
    const through = s[pick(0, s.length - 1)].date;
    const part = prepaidSchedule(p, through);
    assert.deepEqual(part, s.filter((x) => x.date <= through), tag);
    const reg = prepaidRegister({ prepaids: [p] }, through).rows[0];
    assert.equal(reg.expensed + reg.remaining, p.cents, tag);
    assert.equal(reg.expensed, part.at(-1).accumulated, tag);
  }
});
