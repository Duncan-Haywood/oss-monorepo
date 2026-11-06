import test from "node:test";
import assert from "node:assert/strict";
import { reorderPlan } from "./reorder.mjs";

const base = { weeklyRate: 20, weeklySd: 8, leadWeeks: 9, onHand: 400, landed: 12, profitPerUnit: 15, moq: 100 };

test("reorder point by hand: 20 x 9 + ceil(1.6449 x 8 x 3)", () => {
  const r = reorderPlan(base);
  assert.equal(r.safetyStock, 40);           // 1.6449 * 8 * 3 = 39.48 -> 40
  assert.equal(r.reorderPoint, 220);         // 180 + 40
  assert.equal(r.orderNow, false);
  assert.equal(r.weeksOfStock, 20);
  assert.equal(r.weeksUntilReorder, 9);      // (400 - 220) / 20
  assert.equal(r.lostUnits, 0);
});

test("at or under the reorder point orders now and counts stock on order", () => {
  assert.equal(reorderPlan({ ...base, onHand: 220 }).orderNow, true);
  assert.equal(reorderPlan({ ...base, onHand: 100, onOrder: 200 }).orderNow, false);
});

test("late order: sales missed before the run lands", () => {
  const r = reorderPlan({ ...base, onHand: 60 });  // 3 weeks of stock, 9 weeks lead
  assert.equal(r.shortWeeks, 6);
  assert.equal(r.lostUnits, 120);
  assert.equal(r.lostProfit, 1800);
  assert.match(r.notes.join(" "), /120 sales missed/);
});

test("minimum order lifts a small order and says so", () => {
  const r = reorderPlan({ ...base, moq: 1000 });
  assert.equal(r.quantity, 1000);
  assert.equal(r.cashTiedUp, 12000);
  assert.match(r.notes.join(" "), /factory minimum/);
});

test("dates run from today", () => {
  const r = reorderPlan({ ...base, today: "2026-11-06" });
  assert.equal(r.stockoutDate, "2027-03-26"); // 140 days on
  assert.equal(r.orderByDate, "2027-01-08");     // 63 days on
  assert.equal(r.arrivalDate, "2027-03-12");
});

test("higher service level means more safety stock; zero spread none", () => {
  assert.ok(reorderPlan({ ...base, service: 99 }).safetyStock > reorderPlan({ ...base, service: 90 }).safetyStock);
  assert.equal(reorderPlan({ ...base, weeklySd: 0 }).safetyStock, 0);
});

test("refuses hostile input with a reason", () => {
  for (const bad of [null, 5, "x", [], {}, { ...base, weeklyRate: 0 }, { ...base, leadWeeks: "9" }, { ...base, onHand: NaN },
    { ...base, service: 97 }, { ...base, landed: -1 }, { ...base, today: "soon" }, { ...base, weeklyRate: Infinity }]) {
    const r = reorderPlan(bad);
    assert.ok(r.error && !r.ok, JSON.stringify(bad));
  }
});
