import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const landing = readFileSync(new URL("./basic-vs-grow.html", import.meta.url), "utf8");

test("index renders every comparePlans column the script writes", () => {
  assert.match(index, /<tbody id="planCompare">/);
  assert.match(index, /Same volume, every plan/);
  for (const header of ["Plan", "Monthly", "Fees / order", "Profit / month", "vs current"]) {
    assert.match(index, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(index, /plan\.monthlyPlan/);
  assert.match(index, /plan\.perOrderFees/);
  assert.match(index, /plan\.monthlyProfit/);
  assert.match(index, /plan\.vsCurrentMonthly/);
  assert.match(index, /comparePlans/);
  assert.match(index, /plan_upgrade_compared/);
});

test("index and the Grow landing keep the liability disclaimer visible", () => {
  for (const html of [index, landing]) {
    assert.match(html, /No warranty/);
    assert.match(html, /not tax, financial, or business advice/i);
    assert.match(html, /GitHub Sponsors/);
  }
});

test("Grow landing states the 612-order worked example the tests lock", () => {
  assert.match(landing, /612 orders\/month/);
  assert.match(landing, /upgradeBreakEvenOrders/);
  assert.match(landing, /comparePlans/);
});
