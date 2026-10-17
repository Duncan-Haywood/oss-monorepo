import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, sdlt } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample 450,000 main home pays 12,500", () => {
  const r = run({});
  assert.equal(r.tax, 2500 + 10000);
  assert.equal(r.effective, 2.78);
  assert.equal(r.rows.length, 3);
});

test("known band totals at standard rates", () => {
  assert.equal(sdlt(125000, "main", false).tax, 0);
  assert.equal(sdlt(300000, "main", false).tax, 5000);
  assert.equal(sdlt(500000, "main", false).tax, 15000);
  assert.equal(sdlt(1000000, "main", false).tax, 43750);
  assert.equal(sdlt(2000000, "main", false).tax, 153750);
});

test("first-time buyer relief and its cliff at 500,000", () => {
  assert.equal(sdlt(300000, "ftb", false).tax, 0);
  assert.equal(sdlt(400000, "ftb", false).tax, 5000);
  assert.equal(sdlt(500000, "ftb", false).tax, 10000);
  assert.equal(sdlt(500001, "ftb", false).tax, 15000);
  assert.equal(sdlt(500001, "ftb", false).relief, false);
  const r = run({ buyer: "ftb", price: 600000 });
  assert.ok(r.findings.some((f) => f.title.includes("does not apply above")));
});

test("additional dwelling adds 5% on the whole price, from 40,000", () => {
  assert.equal(sdlt(300000, "additional", false).tax, 20000);
  assert.equal(sdlt(39999, "additional", false).tax, 0);
  assert.equal(sdlt(40000, "additional", false).tax, 2000);
  const r = run({ buyer: "additional", price: 300000 });
  assert.ok(r.findings.some((f) => f.title.includes("adds GBP 15,000")));
});

test("non-UK resident surcharge adds 2%", () => {
  assert.equal(sdlt(300000, "main", true).tax, 11000);
  assert.equal(sdlt(300000, "additional", true).tax, 26000);
  assert.equal(sdlt(300000, "ftb", true).tax, 6000);
});

test("tax is rounded down to whole pounds", () => {
  assert.equal(sdlt(250001.5, "main", false).tax, 2500);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, price: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, price: -5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, price: "abc" }).errors.length);
  assert.ok(compute({ ...SAMPLE, buyer: "x" }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not tax advice"));
  assert.ok(t.includes("Stamp Duty to pay: GBP 12,500"));
});
