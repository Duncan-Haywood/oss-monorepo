import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetDiff, diffText } from "./compare.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

const line = (section, item, qty, unit, unitPrice) => ({ section, item, qty, unit, unitPrice, amount: unitPrice == null ? null : Math.round(qty * unitPrice * 100) / 100, source: "t" });
const bud = (lines, total) => ({ lines, materials: total, tax: 0, contingency: 0, labor: 0, allowances: 0, total, overhead: 0, profit: 0, bid: total });

test("hand-made budgets: changed, added, removed and unpriced lines", () => {
  const a = bud([line("Roof", "Shingle bundles", 30, "bundles", 40), line("Floor", "Subfloor sheets", 20, "sheets", 25), line("Siding", "Boards", 10, "each", null)], 1700);
  const b = bud([line("Roof", "Shingle bundles", 33, "bundles", 40), line("Floor", "Joist hangers", 10, "each", 2), line("Siding", "Boards", 12, "each", null)], 1840);
  const d = budgetDiff(a, b);
  const g = (item) => d.lines.find((l) => l.item === item);
  assert.equal(g("Shingle bundles").dAmount, 120); // 3 x 40
  assert.equal(g("Subfloor sheets").status, "removed");
  assert.equal(g("Subfloor sheets").dAmount, -500);
  assert.equal(g("Joist hangers").status, "added");
  assert.equal(g("Joist hangers").dAmount, 20);
  assert.equal(g("Boards").dAmount, null); // no price: not netted, listed
  assert.deepEqual(d.unpricedChanges, ["Boards (+2 each)"]);
  assert.equal(d.totals.total.delta, 140);
  assert.equal(d.pctOfBase, 8.24);
  assert.equal(d.sections.find((s) => s.name === "Roof").delta, 120);
});

test("an unchanged line is left out; identical budgets give no change", () => {
  const a = bud([line("Roof", "Shingle bundles", 30, "bundles", 40)], 1200);
  const d = budgetDiff(a, a);
  assert.equal(d.lines.length, 0);
  assert.equal(d.totals.total.delta, 0);
  assert.ok(diffText(d).includes("  No line changed."));
});

test("lumber lines whose length count changed pair into one change", () => {
  const a = bud([line("Lumber", "2x4 boards (3 lengths)", 100, "boards", 8)], 800);
  const b = bud([line("Lumber", "2x4 boards (4 lengths)", 90, "boards", 8.5)], 765);
  const d = budgetDiff(a, b);
  assert.equal(d.lines.length, 1);
  assert.equal(d.lines[0].status, "changed");
  assert.equal(d.lines[0].dAmount, -35);
});

test("CLI: 16 in to 24 in spacing on the same walls, same prices, saves lumber and the totals tie out", () => {
  const prices = { wallSheet: 30, laborWallFoot: 10 };
  const base = { ...samplePlan(), prices };
  const rev = { ...samplePlan(), studSpacing: 24, prices };
  const files = { "a.json": JSON.stringify(base), "b.json": JSON.stringify(rev) };
  const read = (p) => files[p];
  const r = main(["a.json", "--compare=b.json", "--json"], read);
  assert.equal(r.code, 0, r.out);
  const d = JSON.parse(r.out);
  const bA = JSON.parse(main(["a.json", "--budget", "--json"], read).out);
  const bB = JSON.parse(main(["b.json", "--budget", "--json"], read).out);
  assert.equal(d.totals.total.before, bA.total);
  assert.equal(d.totals.total.after, bB.total);
  assert.equal(d.totals.total.delta, Math.round((bB.total - bA.total) * 100) / 100);
  assert.ok(d.totals.total.delta < 0, "wider spacing frames the same walls with fewer studs");
  const text = main(["a.json", "--compare=b.json"], read);
  assert.match(text.out, /^CHANGE ORDER/);
  assert.match(text.out, /Cost total/);
});

test("CLI: a revised plan with an error is reported, not compared", () => {
  const read = (p) => (p === "a.json" ? JSON.stringify(samplePlan()) : "{not json");
  const r = main(["a.json", "--compare=b.json"], read);
  assert.notEqual(r.code, 0);
});
