import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS_2026, money, catchUpFor, netSelfEmploymentEarnings, sepIraContribution,
  solo401kContribution, profitNeededFor, comparePlans, profitSweep,
} from "./calc.mjs";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} within ${eps} of ${b}`);

test("net self-employment earnings match the Publication 560 worksheet", () => {
  close(netSelfEmploymentEarnings(150_000), 139_402.84, 0.01);
  assert.equal(netSelfEmploymentEarnings(-5_000), 0);
  assert.ok(netSelfEmploymentEarnings(5_000_000) <= LIMITS_2026.compensationLimit);
});

test("SEP-IRA is 20% of net earnings and stops at $72,000", () => {
  close(sepIraContribution(150_000), 27_880.57);
  assert.equal(sepIraContribution(0), 0);
  assert.equal(sepIraContribution(5_000_000), 72_000);
});

test("SEP-IRA gets no catch-up even at 55", () => {
  assert.equal(sepIraContribution(150_000), sepIraContribution(150_000));
  const c = comparePlans({ netProfit: 600_000, age: 55 });
  assert.equal(c.sep, 72_000);
  assert.equal(c.solo.total, 80_000);
});

test("Solo 401(k) agrees with the published solo-401k-contribution-calculator", () => {
  const s = solo401kContribution(150_000, { age: 52 });
  assert.equal(s.deferral, 32_500);
  close(s.employer, 27_880.57);
  close(s.total, 60_380.57);
});

test("Solo 401(k) is never below the SEP-IRA, at any profit or age", () => {
  for (const age of [0, 40, 50, 55, 60, 63, 64]) {
    for (let p = 0; p <= 700_000; p += 7_500) {
      assert.ok(solo401kContribution(p, { age }).total >= sepIraContribution(p) - 1e-9, `age ${age} profit ${p}`);
    }
  }
});

test("a small earner is limited by earnings, not the deferral limit", () => {
  const s = solo401kContribution(10_000, {});
  assert.ok(s.total <= s.earnings);
  assert.ok(s.total > sepIraContribution(10_000));
});

test("a day-job deferral shrinks the Solo 401(k) and leaves the SEP-IRA alone", () => {
  const a = comparePlans({ netProfit: 100_000, age: 40, deferralUsedElsewhere: 0 });
  const b = comparePlans({ netProfit: 100_000, age: 40, deferralUsedElsewhere: 20_000 });
  assert.equal(a.sep, b.sep);
  close(a.solo.deferral - b.solo.deferral, 20_000);
  assert.ok(b.findings.some((f) => /W-2 401\(k\) deferral/.test(f.title)));
  const maxed = comparePlans({ netProfit: 100_000, age: 40, deferralUsedElsewhere: 99_999 });
  assert.equal(maxed.solo.deferral, 0);
  close(maxed.solo.total, maxed.sep);
});

test("at the same ceiling the two plans are reported as equal", () => {
  const c = comparePlans({ netProfit: 5_000_000, age: 30 });
  assert.equal(c.gap, 0);
  assert.ok(c.findings.some((f) => /same amount/.test(f.title)));
});

test("tax saving is gap times marginal rate, with the rate clamped", () => {
  const c = comparePlans({ netProfit: 80_000, age: 45, marginalRate: 0.24 });
  close(c.taxSavedExtra, c.gap * 0.24);
  close(c.taxSavedSep + c.taxSavedExtra, c.taxSavedSolo);
  assert.equal(comparePlans({ netProfit: 80_000, marginalRate: 9 }).rate, 0.6);
  assert.equal(comparePlans({ netProfit: 80_000, marginalRate: -1 }).rate, 0);
});

test("profit needed to max out is consistent with the contribution functions", () => {
  const c = comparePlans({ netProfit: 1, age: 0 });
  assert.ok(c.profitToMaxSolo < c.profitToMaxSep, "Solo maxes out at lower profit");
  close(sepIraContribution(c.profitToMaxSep), 72_000, 1);
  assert.ok(sepIraContribution(c.profitToMaxSep - 5) < 72_000);
  assert.equal(profitNeededFor(() => 0, 100), null);
  assert.equal(profitNeededFor((p) => p, 0), null);
});

test("no earnings gives a high-severity finding and zero contributions", () => {
  const c = comparePlans({ netProfit: -100, age: 30 });
  assert.equal(c.sep, 0);
  assert.equal(c.solo.total, 0);
  assert.equal(c.findings[0].severity, "high");
});

test("catch-up appears in findings only for ages 50+", () => {
  assert.equal(catchUpFor(49), 0);
  assert.ok(comparePlans({ netProfit: 90_000, age: 52 }).findings.some((f) => /no catch-up/.test(f.title)));
  assert.ok(!comparePlans({ netProfit: 90_000, age: 40 }).findings.some((f) => /no catch-up/.test(f.title)));
});

test("the profit sweep is monotone and the gap shrinks to zero at the top", () => {
  const rows = profitSweep({ age: 0 });
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].sep >= rows[i - 1].sep && rows[i].solo >= rows[i - 1].solo);
  }
  assert.equal(rows.at(-1).gap, 0);
  assert.ok(rows[0].gap > 0);
});

test("money formats and does not print negative zero", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-0.001), "$0.00");
});

test("money treats a non-number as zero, not one", () => {
  assert.equal(money(undefined), "$0.00");
  assert.equal(money(NaN), "$0.00");
  assert.equal(money("abc"), "$0.00");
});

test("comparePlans with no input is an empty profit, not a $1 one", () => {
  const c = comparePlans();
  assert.equal(c.earnings, 0);
  assert.equal(c.findings[0].severity, "high");
});

test("a $1 profit still has earnings to contribute from", () => {
  const c = comparePlans({ netProfit: 1 });
  assert.ok(c.earnings > 0 && c.earnings < 1);
  assert.ok(!c.findings.some((f) => /No net self-employment earnings/.test(f.title)));
});

test("profit needed to max the Solo 401(k) includes the catch-up on top of $72,000", () => {
  for (const age of [0, 55, 61]) {
    const target = LIMITS_2026.annualAdditions + catchUpFor(age);
    const p = comparePlans({ netProfit: 1, age }).profitToMaxSolo;
    close(solo401kContribution(p, { age }).total, target, 1);
    assert.ok(solo401kContribution(p - 5, { age }).total < target);
  }
});
