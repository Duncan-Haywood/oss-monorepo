import test from "node:test";
import assert from "node:assert/strict";
import { tierLadder, ladderCsv } from "./tiers.mjs";
import { unitCost, sellingSide } from "./costing.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";
import { newDesign } from "./design.mjs";

// Plain sheet: no decoration, no duty, no wastage, so the arithmetic is by hand.
const sheet = { ...EXAMPLE_SUPPLIER, example: false, currency: "EUR", moq: 50, wastagePct: 0, trimsPerUnit: 0, packagingPerUnit: 0, freightPerUnit: 0, dutyPct: 0,
  fabrics: { "cotton-jersey": 5, "heavyweight-cotton": 8, "organic-cotton": 12 }, metresPerGarment: { tee: 1 }, cutAndSew: { tee: 4 }, methods: {} };
const design = newDesign({ garment: "tee", quantity: 100 });
const plan = { salesTaxPct: 0, channelFeePct: 0, paymentFeePct: 0, paymentFixed: 0, unsoldPct: 0, marketingBudget: 0, targetMarginPct: 50 };

test("landed cost steps with the fabric by hand", () => {
  const l = tierLadder({ ...design, placements: [] }, sheet, [
    { name: "Good", fabric: "cotton-jersey" }, { name: "Better", fabric: "heavyweight-cotton" }, { name: "Best", fabric: "organic-cotton" }], plan);
  assert.deepEqual(l.rows.map(r => r.landed), [9, 12, 16]);          // fabric + 4 cut and sew
  assert.deepEqual(l.rows.map(r => r.priceForTarget), [18, 24, 32]); // 50% margin, no fees: cost x 2
  assert.deepEqual(l.rows.map(r => r.stepCost), [null, 3, 4]);
  assert.deepEqual(l.rows.map(r => r.sell.marginPct), [50, 50, 50]);
  assert.equal(l.notes.length, 0);
});

test("a typed price that grows slower than cost is flagged", () => {
  const l = tierLadder({ ...design, placements: [] }, sheet, [
    { name: "Good", fabric: "cotton-jersey", price: 20 }, { name: "Best", fabric: "organic-cotton", price: 22 }], plan);
  // profit 11 -> 6: costs 7 more, earns 5 less
  assert.equal(l.rows[1].stepProfit, -5);
  assert.match(l.notes[0], /earns 5 less/);
  assert.match(l.notes[0], /at least 5/);
});

test("an unpriced fabric is reported, the other tiers still price", () => {
  const l = tierLadder({ ...design, placements: [] }, sheet, [{ name: "Good", fabric: "cotton-jersey" }, { name: "Luxe", fabric: "linen" }], plan);
  assert.equal(l.rows[0].landed, 9);
  assert.match(l.rows[1].error, /linen/);
  assert.match(l.notes.at(-1), /Luxe/);
});

test("agrees with unitCost and sellingSide directly", () => {
  const d = { ...design, placements: [], fabric: "heavyweight-cotton" };
  const c = unitCost(d, sheet);
  const s = sellingSide({ landed: c.landed, price: 30, quantity: 100, moq: 50, currency: "EUR" }, plan);
  const l = tierLadder(design, sheet, [{ name: "B", fabric: "heavyweight-cotton", price: 30 }], plan);
  assert.equal(l.rows[0].sell.profitPerSale, s.profitPerSale);
  assert.equal(s.profitPerSale, 18);
});

test("csv defuses formulas and quotes", () => {
  const l = tierLadder({ ...design, placements: [] }, sheet, [{ name: "=cmd|x", fabric: "cotton-jersey" }], plan);
  const csv = ladderCsv(l);
  assert.match(csv, /"'=cmd\|x"/);
  assert.equal(csv.split("\n")[0].split(",").length, 9);
});
