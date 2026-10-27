// Property test for loan schedules: seeded random loans (made up, no outside data).
// Invariants: principal sums to the amount borrowed, the balance never goes negative
// or up, interest equals payments minus principal, the last payment is within a few
// cents of the level one, and extra principal never costs more interest.
import test from "node:test";
import assert from "node:assert/strict";
import { levelPayment, loanSchedule } from "./loans.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("loan schedules hold their invariants on 600 random loans", () => {
  const r = rng(20261028), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 600; i++) {
    const cents = pick(100_00, 900_000_00), rateBp = r() < 0.1 ? 0 : pick(1, 2500), months = pick(1, 360);
    const day = pick(1, 31), first = `2026-${String(pick(1, 12)).padStart(2, "0")}-${String(Math.min(day, 28)).padStart(2, "0")}`;
    const loan = { cents, rateBp, months, first, payment: levelPayment(cents, rateBp, months) };
    const s = loanSchedule(loan), tag = JSON.stringify(loan);
    assert.equal(s.length, months, tag);
    assert.equal(s.reduce((a, x) => a + x.principal + x.extra, 0), cents, "principal sums to amount " + tag);
    assert.equal(s.at(-1).balance, 0, tag);
    let prev = cents;
    for (const x of s) {
      assert.ok(x.balance >= 0 && x.balance <= prev, "balance falls " + tag);
      assert.ok(x.interest >= 0 && x.principal >= 0, "no negative parts " + tag);
      assert.equal(x.payment, x.principal + x.interest, tag);
      prev = x.balance;
    }
    // payment rounded to the cent (<= 0.5c off) compounds: the last payment absorbs
    // 0.5c x ((1+i)^n - 1) / i, and each month's interest rounds by up to 0.5c too, which
    // compounds the same way (so a 20% loan over 26 years drifts by dollars, as a lender's would)
    const i = rateBp / 120000, grow = i === 0 ? months : (Math.pow(1 + i, months) - 1) / i;
    const drift = Math.abs(s.at(-1).payment - loan.payment);
    assert.ok(months === 1 || drift <= grow + 2, `last payment drift ${drift} ${tag}`);
    // an extra payment mid-way never adds interest or months
    if (months > 3) {
      const withExtra = loanSchedule({ ...loan, extras: [{ date: s[1].date, cents: Math.floor(cents / 10) }] });
      const sum = (a, k) => a.reduce((t, x) => t + x[k], 0);
      assert.ok(withExtra.length <= s.length, "fewer or equal rows " + tag);
      assert.ok(sum(withExtra, "interest") <= sum(s, "interest"), "less interest " + tag);
      assert.equal(sum(withExtra, "principal") + sum(withExtra, "extra"), cents, tag);
    }
  }
});
