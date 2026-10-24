import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { budget, budgetText } from "./budget.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";
import { sampleFloor } from "./floor.mjs";
import { sampleRoof } from "./roof.mjs";
import { sampleFoundation } from "./foundation.mjs";

const full = (prices) => ({ ...samplePlan(), floor: sampleFloor(), roof: sampleRoof(), foundation: sampleFoundation(), ...(prices ? { prices } : {}) });
const run = (plan, ...flags) => main([ "p.json", ...flags ], () => JSON.stringify(plan));
const bud = (plan) => JSON.parse(run(plan, "--sheathing", "--budget", "--json").out);

test("lumber lines add up to the cutting-stock order's own cost", () => {
  const b = bud(full());
  const order = JSON.parse(run(full(), "--sheathing", "--json").out);
  const lumber = b.sections.find((s) => s.name === "Lumber").subtotal;
  assert.ok(Math.abs(lumber - order.summary.cost) < 0.05, `${lumber} vs ${order.summary.cost}`);
});

test("quantities without a typed price are listed, never guessed", () => {
  const b = bud(full());
  assert.ok(b.unpriced.some((u) => u.startsWith("Rebar")));
  assert.ok(b.lines.filter((l) => l.amount == null).every((l) => l.unitPrice == null));
  const sheets = b.lines.find((l) => l.item === "Subfloor sheets");
  assert.equal(sheets.amount, null);
});

test("typed prices multiply the model's quantities, then tax and contingency stack", () => {
  const b = bud(full({ floorSheet: 30, rebarLb: 1, concreteYd: 150, tax: 0.1, contingency: 0.05 }));
  const fl = b.lines.find((l) => l.item === "Subfloor sheets");
  assert.equal(fl.amount, +(fl.qty * 30).toFixed(2));
  const conc = b.lines.find((l) => l.item === "Concrete");
  assert.equal(conc.amount, +(conc.qty * 150).toFixed(2));
  const tax = +(b.materials * 0.1).toFixed(2);
  assert.equal(b.tax, tax);
  assert.equal(b.contingency, +((b.materials + tax) * 0.05).toFixed(2));
  assert.equal(b.total, +(b.materials + b.tax + b.contingency).toFixed(2));
});

test("a typed wall sheet price replaces the order's own sheet prices", () => {
  const a = bud(full()).lines.find((l) => l.item === "Wall sheathing sheets");
  const b = bud(full({ wallSheet: 50 })).lines.find((l) => l.item === "Wall sheathing sheets");
  assert.equal(b.unitPrice, 50);
  assert.equal(b.qty, a.qty);
});

test("walls-only plan has lumber and no shell sections", () => {
  const b = bud(samplePlan());
  assert.deepEqual(b.sections.map((s) => s.name), ["Lumber", "Sheathing"]);
});

test("the CLI prints a BUDGET section and the labor disclaimer", () => {
  const out = run(full({ roofSheet: 40 }), "--budget").out;
  assert.match(out, /\nBUDGET\n/);
  assert.match(out, /Not in the total, no price typed/);
  assert.match(out, /Materials only: no labor/);
});

test("budgetText handles an empty result", () => {
  assert.ok(budgetText(budget({ orders: [] })).length >= 2);
});
