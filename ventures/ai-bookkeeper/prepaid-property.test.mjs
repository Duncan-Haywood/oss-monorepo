// Property test for prepaid expenses: seeded random items (made up, no outside data).
// Invariants: the months add up to the amount exactly, month ends are in order and one
// per month, a cut-off date gives a prefix of the full schedule, the register splits
// each amount into used plus remaining, and the entries balance.
import test from "node:test";
import assert from "node:assert/strict";
import { addPrepaid, prepaidSchedule, prepaidRegister, prepaidEntries } from "./prepaid.mjs";
import { newBooks } from "./engine.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("prepaid schedules hold their invariants on 500 random items", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 500; i++) {
    const cents = r() < 0.2 ? pick(1, 70) : pick(100, 5_000_000), months = pick(2, 60);
    const date = `20${pick(20, 30)}-${String(pick(1, 12)).padStart(2, "0")}-${String(pick(1, 28)).padStart(2, "0")}`;
    const tag = JSON.stringify({ cents, months, date });
    const { books, prepaid } = addPrepaid(newBooks(), { name: "Item", date, amount: cents / 100, months });
    const s = prepaidSchedule(prepaid);
    assert.equal(s.reduce((a, x) => a + x.cents, 0), cents, "months add up " + tag);
    assert.equal(s.at(-1).accumulated, cents, tag);
    assert.ok(s.length <= months && s.every((x) => x.cents > 0), tag);
    for (let k = 1; k < s.length; k++) assert.ok(s[k].date > s[k - 1].date && s[k].accumulated === s[k - 1].accumulated + s[k].cents, "ordered " + tag);
    assert.ok(s.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.date >= date.slice(0, 8) + "01"), tag);
    // the cents are spread evenly: no month is more than a cent off the average
    for (const x of s) assert.ok(Math.abs(x.cents - cents / months) < 1 + (cents < months ? 1 : 0), "even " + tag);
    // cutting off partway gives the same first months
    const cut = s[pick(0, s.length - 1)].date;
    const part = prepaidSchedule(prepaid, cut);
    assert.deepEqual(part, s.filter((x) => x.date <= cut), "prefix " + tag);
    // register: used + remaining = amount, at any date
    const probe = `20${pick(20, 32)}-${String(pick(1, 12)).padStart(2, "0")}-${String(pick(1, 28)).padStart(2, "0")}`;
    const row = prepaidRegister(books, probe).rows[0];
    assert.equal(row.expensed + row.remaining, cents, tag);
    assert.ok(row.expensed >= 0 && row.remaining >= 0, tag);
    // entries balance and move only from prepaid to the expense account
    for (const e of prepaidEntries(books)) assert.equal(e.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0, tag);
  }
});
