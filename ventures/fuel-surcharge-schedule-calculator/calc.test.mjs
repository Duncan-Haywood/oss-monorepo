import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrograms, excessPrice, surchargeOf, plan, sensitivity, sampleInput, toCsv } from "./calc.mjs";

const prog = (line) => parsePrograms(line).programs[0];

test("cpm program: price rounded down to steps, divided by mpg basis", () => {
  const p = prog("A, 1.20, 6, 0.05, loaded, cpm");
  const e = excessPrice(p, 4.05);
  assert.equal(e.steps, 57);
  assert.equal(e.over, 2.85);
  const s = surchargeOf(p, { price: 4.05, loaded: 600, deadhead: 100, linehaul: 0 });
  assert.equal(s.perMile, 0.475);
  assert.equal(s.total, 285);
});

test("price at or below the peg earns no surcharge", () => {
  const p = prog("A, 3.50, 6, 0.05, loaded, cpm");
  assert.equal(surchargeOf(p, { price: 3.4, loaded: 500, deadhead: 0, linehaul: 0 }).total, 0);
});

test("step rounds down: 4.04 against a 0.05 step loses 4 cents", () => {
  const p = prog("A, 1.20, 6, 0.05, loaded, cpm");
  assert.equal(excessPrice(p, 4.04).over, 2.8);
});

test("all-miles program also pays deadhead", () => {
  const p = prog("B, 1.25, 6.5, 0.06, all, cpm");
  const s = surchargeOf(p, { price: 4.05, loaded: 640, deadhead: 90, linehaul: 0 });
  assert.equal(s.paidMiles, 730);
});

test("percent program: percent per step times linehaul", () => {
  const p = prog("C, 3.00, 0.5, 0.10, loaded, pct");
  const s = surchargeOf(p, { price: 4.05, loaded: 640, deadhead: 0, linehaul: 1750 });
  assert.equal(s.pct, 5);
  assert.equal(s.total, 87.5);
});

test("zero step follows the price continuously", () => {
  const p = prog("D, 1.00, 5, 0, loaded, cpm");
  assert.equal(excessPrice(p, 3).over, 2);
  assert.equal(surchargeOf(p, { price: 3, loaded: 100, deadhead: 0, linehaul: 0 }).total, 40);
});

test("plan reports the gap between extra fuel burned and surcharge paid", () => {
  const r = plan(sampleInput());
  const a = r.rows[0];
  assert.equal(a.total, 304);
  assert.equal(a.extraFuel, 342.19);
  assert.equal(a.gap, 38.19);
  assert.equal(a.recoveredPct, 88.84);
  assert.ok(r.advice.some((x) => /deadhead/.test(x)));
  assert.ok(r.advice.some((x) => /Read the fuel clause/.test(x)));
});

test("a worse real mpg than the basis is called out", () => {
  const r = plan({ ...sampleInput(), mpg: 5.5 });
  assert.ok(r.advice.some((x) => /assumes 6 mpg but your truck gets 5.5/.test(x)));
});

test("sensitivity keeps the pump spread and moves with price", () => {
  const rows = sensitivity(sampleInput());
  assert.equal(rows[1].surcharge, 304);
  assert.ok(rows[4].surcharge > rows[1].surcharge);
  assert.equal(rows[1].extraFuel, 342.19);
});

test("bad input is reported, not thrown", () => {
  assert.match(plan({ ...sampleInput(), price: 0 }).error, /diesel price/);
  assert.match(plan({ ...sampleInput(), loaded: "" }).error, /loaded miles/);
  assert.match(plan({ ...sampleInput(), programs: "X, 1, 6, 0.05, sideways, cpm" }).error, /loaded or all/);
  assert.match(plan({ ...sampleInput(), programs: "X, abc, 6" }).error, /plain numbers/);
  assert.match(plan({ ...sampleInput(), linehaul: "" }).error, /linehaul/);
  assert.match(plan({ ...sampleInput(), programs: "" }).error, /at least one/);
});

test("csv has a header row and one line per program", () => {
  const lines = toCsv(plan(sampleInput())).trim().split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^program,type,peg/);
});
