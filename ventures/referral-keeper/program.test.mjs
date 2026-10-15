import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, lifetimePerCustomer } from "./program.mjs";

const base = { price: 100, billing: "monthly", percent: 20, months: 12, newPerMonth: 1, horizon: 12, churn: 0, refundRate: 0, holdDays: 30 };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("no churn, no refunds: month n has n payers", () => {
  const r = simulate(base);
  near(r.rows[0].revenue, 100);
  near(r.rows[11].revenue, 1200);
  near(r.totalRevenue, 100 * (12 * 13) / 2);
  near(r.effectiveRate, 0.2);
});

test("the commission window caps each customer", () => {
  const r = simulate({ ...base, months: 3, horizon: 12 });
  near(r.totalCommission, 660); // cohorts 1-10 pay 3 times, cohort 11 twice, cohort 12 once: 20 x (30 + 2 + 1)
  assert.ok(r.totalCommission < simulate({ ...base, months: 0 }).totalCommission);
  near(lifetimePerCustomer({ ...base, months: 3 }), 60);
});

test("lifetime commission with churn converges to price*pct/churn", () => {
  near(lifetimePerCustomer({ ...base, months: 0, churn: 0.05 }), (100 * 0.2) / 0.05, 0.01);
});

test("refunds shave the first payment", () => {
  near(lifetimePerCustomer({ ...base, months: 1, refundRate: 0.1 }), 18);
});

test("annual billing pays once a year and the window counts months", () => {
  near(lifetimePerCustomer({ ...base, billing: "annual", months: 12 }), 240); // first annual payment only
  near(lifetimePerCustomer({ ...base, billing: "annual", months: 13 }), 480); // month 12 payment is inside
  const r = simulate({ ...base, billing: "annual", horizon: 24 });
  near(r.rows[0].revenue, 1200);
  near(r.rows[1].revenue, 1200);
});

test("hold delays what has been paid out, not what has been earned", () => {
  const r = simulate({ ...base, holdDays: 60, horizon: 4 });
  near(r.rows[0].paidOut, 0);
  near(r.rows[1].paidOut, 0);
  near(r.rows[2].paidOut, r.rows[0].commission);
  near(r.rows[3].owed, r.rows[3].cumCommission - r.rows[3].paidOut);
});

test("horizon is clamped", () => {
  assert.equal(simulate({ ...base, horizon: 9999 }).rows.length, 120);
  assert.equal(simulate({ ...base, horizon: 0 }).rows.length, 1);
});
