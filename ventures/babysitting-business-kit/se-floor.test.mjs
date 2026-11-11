import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

// Schedule SE: the $400 floor is on net earnings (profit x 92.35%), not on profit.
// A $420 profit is $387.87 of net earnings, so no SE tax.
test("profit of $420 is under the $400 net-earnings floor", () => {
  const desk = E.emptyDesk();
  desk.bookings = [{ id: "1", date: "2026-05-01", start: "08:00", end: "09:00", payments: [{ amount: 420, date: "2026-05-01" }] }];
  assert.equal(E.taxSummary(desk, 2026).seTax, 0);
  desk.bookings[0].payments[0].amount = 434; // 400.80 of net earnings
  assert.equal(E.taxSummary(desk, 2026).seTax, Math.round(434 * 0.9235 * 0.153 * 100) / 100);
});
