import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, num, money, money2, slotsPerYear, annual, breakevenFee, reminderEffect,
  breakevenReminderPrice, binomialPmf, overbookingDay, bestOverbooking, sensitivity,
} from "./calc.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// 10 slots, 5 days, 50 weeks = 2500 slots a year; round numbers so it is hand-checkable.
const simple = {
  ...DEFAULTS, slotsPerDay: 10, daysPerWeek: 5, weeksPerYear: 50, revenuePerVisit: 100,
  noShowPct: 10, lateCancelPct: 10, refillNoShowPct: 0, refillLateCancelPct: 50,
  feeAmount: 0, feeCollectPct: 50, reminderCostPerVisit: 0, reminderCutPct: 0, overbookSlots: 0, overflowCost: 50,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("8%"), 8);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});

test("annual figures match the hand calculation", () => {
  assert.equal(slotsPerYear(simple), 2500);
  const a = annual(simple);
  assert.equal(a.noShows, 250);
  assert.equal(a.lateCancels, 250);
  assert.equal(a.grossNoShow, 25000);
  assert.equal(a.grossLateCancel, 25000);
  assert.equal(a.refilledRevenue, 12500); // half the late-cancel slots refilled
  assert.equal(a.costAfterRefills, 37500);
  assert.equal(a.netCost, 37500); // no fee
});

test("fees collected reduce the net cost by events x fee x collection rate", () => {
  const a = annual({ ...simple, feeAmount: 80 });
  assert.equal(a.feeEach, 40);
  assert.equal(a.feesCollected, 500 * 40);
  assert.equal(a.netCost, 37500 - 20000);
});

test("break-even fee zeroes the net cost", () => {
  const f = breakevenFee(simple);
  // 37500 over 500 events at 50% collected: 150 each charged
  close(f, 150);
  close(annual({ ...simple, feeAmount: f }).netCost, 0, 1e-6);
  // also holds with different refill and collection inputs
  const o = { ...DEFAULTS, feeCollectPct: 30, refillNoShowPct: 20 };
  close(annual({ ...o, feeAmount: breakevenFee(o) }).netCost, 0, 1e-6);
});

test("break-even fee is null when nothing is collected or nothing is lost", () => {
  assert.equal(breakevenFee({ ...simple, feeCollectPct: 0 }), null);
  assert.equal(breakevenFee({ ...simple, noShowPct: 0, lateCancelPct: 0 }), null);
});

test("reminders: benefit, programme cost and break-even price", () => {
  const o = { ...simple, reminderCutPct: 50, reminderCostPerVisit: 0.5 };
  const r = reminderEffect(o);
  close(r.avoidedNoShows, 125);
  close(r.benefit, 125 * 100); // no refill on no-shows, no fee
  close(r.programCost, 1250);
  close(r.net, 12500 - 1250);
  close(breakevenReminderPrice(o), 12500 / 2500); // $5 per scheduled visit
  const atBreakEven = reminderEffect({ ...o, reminderCostPerVisit: breakevenReminderPrice(o) });
  close(atBreakEven.net, 0, 1e-6);
});

test("reminders that cut nothing have a zero break-even price", () => {
  assert.equal(breakevenReminderPrice({ ...simple, reminderCutPct: 0 }), 0);
});

test("a fee collected on every no-show can make avoiding one worth less than the visit", () => {
  const o = { ...simple, reminderCutPct: 50, feeAmount: 100, feeCollectPct: 100 };
  // A prevented no-show earns $100 visit but forgoes a $100 fee: no benefit.
  close(reminderEffect(o).benefit, 0, 1e-6);
});

test("binomial probabilities sum to one and match mean and a hand value", () => {
  for (const [n, p] of [[1, 0.3], [10, 0.85], [17, 0.5], [30, 0.9]]) {
    const pmf = binomialPmf(n, p);
    close(pmf.reduce((s, q) => s + q, 0), 1, 1e-12);
    close(pmf.reduce((s, q, k) => s + q * k, 0), n * p, 1e-9);
  }
  const small = binomialPmf(3, 0.5);
  [0.125, 0.375, 0.375, 0.125].forEach((q, i) => close(small[i], q, 1e-12));
  assert.deepEqual(binomialPmf(4, 0), [1, 0, 0, 0, 0]);
  assert.deepEqual(binomialPmf(2, 1), [0, 0, 1]);
});

// Independent check: enumerate every one of the 2^n show/no-show outcomes.
function brute(n, p, cap, rev, overflow) {
  let value = 0, over = 0, lost = 0, pOver = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let shows = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) shows++;
    const prob = Math.pow(p, shows) * Math.pow(1 - p, n - shows);
    value += prob * (rev * Math.min(shows, cap) - overflow * Math.max(shows - cap, 0));
    over += prob * Math.max(shows - cap, 0);
    lost += prob * Math.max(cap - shows, 0);
    if (shows > cap) pOver += prob;
  }
  return { value, over, lost, pOver };
}

test("overbooking day agrees with full enumeration of outcomes", () => {
  const o = { ...DEFAULTS, slotsPerDay: 8, noShowPct: 10, lateCancelPct: 8, revenuePerVisit: 120, overflowCost: 70 };
  for (const extra of [0, 1, 2, 3]) {
    const d = overbookingDay(o, extra);
    const b = brute(8 + extra, 0.82, 8, 120, 70);
    close(d.dailyValue, b.value, 1e-9);
    close(d.expectedOverflow, b.over, 1e-9);
    close(d.expectedLostSlots, b.lost, 1e-9);
    close(d.probOverflow, b.pOver, 1e-9);
    assert.equal(d.booked, 8 + extra);
  }
});

test("seen plus overflow equals expected arrivals", () => {
  const d = overbookingDay(DEFAULTS, 3);
  close(d.expectedSeen + d.expectedOverflow, d.booked * d.showProb, 1e-9);
});

test("best overbooking level is the argmax of the enumerated value", () => {
  const o = { ...DEFAULTS, slotsPerDay: 8, noShowPct: 12, lateCancelPct: 8, revenuePerVisit: 120, overflowCost: 70 };
  const r = bestOverbooking(o, 6);
  const values = [0, 1, 2, 3, 4, 5, 6].map((k) => brute(8 + k, 0.8, 8, 120, 70).value);
  const argmax = values.indexOf(Math.max(...values));
  assert.equal(r.best.extra, argmax);
  assert.ok(r.best.extra >= 1, "a 20% empty rate should justify some overbooking");
  close(r.annualGainVsNone, (values[argmax] - values[0]) * r.days, 1e-6);
});

test("no overbooking when every booking shows or an overflow patient costs a lot", () => {
  assert.equal(bestOverbooking({ ...DEFAULTS, noShowPct: 0, lateCancelPct: 0 }).best.extra, 0);
  assert.equal(bestOverbooking({ ...DEFAULTS, overflowCost: 100000 }).best.extra, 0);
});

test("the typed current level is compared with the best", () => {
  const r = bestOverbooking({ ...DEFAULTS, overbookSlots: 6 });
  assert.equal(r.current.extra, 6);
  assert.ok(r.annualGainVsCurrent >= 0);
  close(r.annualGainVsNone, (r.best.dailyValue - r.rows[0].dailyValue) * r.days);
});

test("sensitivity grid middle cell equals the base net cost and falls as fees rise", () => {
  const g = sensitivity(DEFAULTS);
  const base = annual(DEFAULTS).netCost;
  const mid = g[2].cells[2];
  close(mid.netCost, base, 1e-6);
  for (const row of g) for (let i = 1; i < row.cells.length; i++) assert.ok(row.cells[i].netCost <= row.cells[i - 1].netCost + 1e-9);
  for (let j = 0; j < g[0].cells.length; j++) for (let i = 1; i < g.length; i++) assert.ok(g[i].cells[j].netCost >= g[i - 1].cells[j].netCost - 1e-9);
});

test("sensitivity falls back to visit-price fractions when no fee is set", () => {
  const g = sensitivity({ ...DEFAULTS, feeAmount: 0 });
  assert.equal(g[0].cells[0].fee, 0);
  assert.equal(g[0].cells[4].fee, 70);
});

test("garbage input yields zeros, not NaN", () => {
  const a = annual({ slotsPerDay: NaN, revenuePerVisit: "x" });
  for (const v of Object.values(a)) assert.ok(Number.isFinite(v));
  assert.ok(Number.isFinite(bestOverbooking({ slotsPerDay: -3 }).best.dailyValue));
});
