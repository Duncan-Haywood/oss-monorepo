import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cacPaybackOutcome, churnAdjustedPayback, churnAdjustedPaybackClosedForm, cumulativeProfit,
  lifetimeValue, maxCacForPayback, simplePaybackMonths, validate, PAYBACK_CAP_MONTHS,
} from "./calc.mjs";

const base = { cac: 800, price: 100, grossMargin: 0.8, monthlyChurn: 0.03, expansion: 0, costOfCapital: 0, targetPaybackMonths: 12 };
const inp = (o = {}) => validate({ ...base, ...o }).input;
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("simple payback is CAC over monthly gross profit", () => {
  close(simplePaybackMonths(inp()), 10);
});

test("no churn: adjusted payback equals the simple payback, rounded up", () => {
  const i = inp({ monthlyChurn: 0, cac: 850 });
  assert.equal(churnAdjustedPayback(i).months, 11);
  close(churnAdjustedPaybackClosedForm(i), 10.625);
});

test("cumulative profit by hand: 3 months at 10% churn", () => {
  const i = inp({ monthlyChurn: 0.1 });
  close(cumulativeProfit(i, 3), 80 * (1 + 0.9 + 0.81));
});

test("iterative payback agrees with the closed form (ceil) across a grid", () => {
  for (const churn of [0, 0.01, 0.03, 0.08]) for (const cac of [300, 800, 1500, 2200]) for (const expansion of [0, 0.01]) {
    const i = inp({ monthlyChurn: churn, cac, expansion });
    const it = churnAdjustedPayback(i).months;
    const cf = churnAdjustedPaybackClosedForm(i);
    if (cf === null || cf > PAYBACK_CAP_MONTHS) assert.equal(it, null, `${churn}/${cac}/${expansion}`);
    else assert.ok(Math.abs(it - Math.ceil(cf - 1e-9)) <= 1e-9, `${churn}/${cac}/${expansion}: ${it} vs ${cf}`);
  }
});

test("customer that can never pay back is reported as null with a high finding", () => {
  const o = cacPaybackOutcome({ ...base, cac: 3000, monthlyChurn: 0.05 });
  assert.equal(o.adjustedPayback, null);
  assert.equal(o.findings[0].severity, "high");
  assert.match(o.findings[0].title, /never pays back/);
});

test("LTV is margin over churn; discounting and expansion move it the right way", () => {
  close(lifetimeValue(inp()), 80 / 0.03);
  assert.ok(lifetimeValue(inp({ costOfCapital: 0.12 }), { discounted: true }) < lifetimeValue(inp()));
  assert.ok(lifetimeValue(inp({ expansion: 0.01 })) > lifetimeValue(inp()));
  assert.equal(lifetimeValue(inp({ monthlyChurn: 0 })), Infinity);
});

test("max CAC for a payback target inverts the payback", () => {
  const i = inp();
  const cap = maxCacForPayback(i, 12);
  assert.equal(churnAdjustedPayback({ ...i, cac: cap }).months, 12);
  assert.ok(churnAdjustedPayback({ ...i, cac: cap * 1.01 }).months > 12);
});

test("validation rejects bad input with a message", () => {
  for (const bad of [{ cac: 0 }, { price: -1 }, { grossMargin: 0 }, { grossMargin: 1.2 }, { monthlyChurn: 1 }, { expansion: -0.1 }, { targetPaybackMonths: 0 }]) {
    assert.ok(cacPaybackOutcome({ ...base, ...bad }).invalid, JSON.stringify(bad));
  }
  assert.ok(cacPaybackOutcome({}).invalid);
});

test("outcome has ratios, sensitivity grid and finding about churn hiding months", () => {
  const o = cacPaybackOutcome({ ...base, cac: 1200, monthlyChurn: 0.05 });
  assert.equal(o.simplePayback, 15);
  assert.ok(o.adjustedPayback >= 20);
  assert.ok(o.findings.some((f) => /Churn adds months/.test(f.title)));
  assert.equal(o.sensitivity.rows.length, 5);
  assert.equal(o.sensitivity.rows[0].cells.length, 4);
  // higher churn never shortens payback
  for (const row of o.sensitivity.rows) for (let k = 1; k < row.cells.length; k++) {
    if (row.cells[k] !== null && row.cells[k - 1] !== null) assert.ok(row.cells[k] >= row.cells[k - 1]);
    if (row.cells[k - 1] === null) assert.equal(row.cells[k], null);
  }
});

test("healthy example lands inside target with an info finding", () => {
  const o = cacPaybackOutcome({ ...base, cac: 500 });
  assert.equal(o.findings[0].severity, "info");
  assert.ok(o.ltvCac > 3);
});
