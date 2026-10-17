import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseItems, analyze, summarize } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/items.csv", import.meta.url), "utf8");

test("parses rows, skips the header, handles $ and tabs", () => {
  assert.equal(parseItems(text).length, 6);
  const t = parseItems("a\t$10.00\t$4.00\t1,200\nb\t5\t2\t10");
  assert.equal(t.length, 2);
  assert.equal(t[0].units, 1200);
});

test("break-even loss matches the closed form (p'-p)/(p'-c)", () => {
  const r = analyze([{ name: "x", price: 100, cost: 60, units: 10 }], { increase: 0.1, elasticity: 1 });
  assert.ok(Math.abs(r.rows[0].breakEvenLoss - 10 / 50) < 1e-12);
});

test("at the neutral elasticity the profit change is zero", () => {
  const item = { name: "x", price: 60, cost: 18, units: 410 };
  const r = analyze([item], { increase: 0.08, elasticity: 1 });
  const e = r.rows[0].neutralElasticity;
  const at = analyze([item], { increase: 0.08, elasticity: e });
  assert.ok(Math.abs(at.rows[0].delta) < 1e-6);
});

test("portfolio neutral elasticity zeroes the total change", () => {
  const items = parseItems(text);
  const r = analyze(items, { increase: 0.08, elasticity: 1 });
  const at = analyze(items, { increase: 0.08, elasticity: r.portfolioNeutral });
  assert.ok(Math.abs(at.totals.delta) < 1e-3);
});

test("below-cost items are an error and excluded", () => {
  const r = analyze([{ name: "bad", price: 5, cost: 6, units: 1 }, { name: "ok", price: 10, cost: 4, units: 1 }], {});
  assert.equal(r.count, 1);
  assert.ok(r.findings.some((f) => f.rule === "below-cost"));
  assert.equal(summarize(r).status, "error");
});

test("high elasticity makes the portfolio lose money; low makes every item pay", () => {
  const items = parseItems(text);
  assert.ok(analyze(items, { increase: 0.08, elasticity: 4 }).findings.some((f) => f.rule === "portfolio-loses-money"));
  assert.ok(analyze(items, { increase: 0.08, elasticity: 0.5 }).findings.some((f) => f.rule === "all-items-pay"));
});

test("empty input has no usable rows", () => {
  assert.equal(summarize(analyze(parseItems("nonsense"), {})).status, "none");
});
