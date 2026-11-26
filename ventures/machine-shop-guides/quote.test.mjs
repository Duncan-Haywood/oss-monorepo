import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { costLot, quoteBreaks, validate, DEFAULT_BREAKS } from "./quote.mjs";

const base = {
  materialPerPart: 10, scrapPct: 0, setupHours: 2, setupRate: 50,
  programHours: 2, programRate: 50, lotsOverProgramLife: 1,
  cycleMinutes: 30, machineRate: 60, markupPct: 20,
  ops: [{ name: "Deburr", minutesPerPart: 6, rate: 30, lotCharge: 0 }, { name: "Anodize", minutesPerPart: 0, rate: 0, lotCharge: 75 }],
};

test("costs one lot line by line from the user's numbers", () => {
  const r = costLot(base, 10);
  assert.equal(r.lines.material, 100);
  assert.equal(r.lines.setup, 100);
  assert.equal(r.lines.programming, 100);
  assert.equal(r.lines.machining, 300);
  assert.equal(r.lines.ops, 30 + 75);
  assert.equal(r.cost, 705);
  assert.equal(r.price, 846);
  assert.equal(r.priceEach, 84.6);
});

test("scrap and program life change material and programming", () => {
  const r = costLot({ ...base, scrapPct: 10, lotsOverProgramLife: 4 }, 10);
  assert.ok(Math.abs(r.lines.material - 110) < 1e-9);
  assert.equal(r.lines.programming, 25);
});

test("price per part falls with quantity because fixed costs spread", () => {
  const rows = quoteBreaks(base, [100, 1, 10, 10]);
  assert.deepEqual(rows.map((r) => r.quantity), [1, 10, 100]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].priceEach < rows[i - 1].priceEach);
});

test("zero inputs give zero, not NaN", () => {
  const r = costLot({}, 5);
  assert.equal(r.cost, 0);
  assert.equal(r.priceEach, 0);
});

test("validation catches negatives", () => {
  assert.deepEqual(validate(base), []);
  assert.ok(validate({ ...base, machineRate: -1 }).length);
  assert.ok(validate({ ...base, lotsOverProgramLife: 0 }).length);
});

test("calibration factors scale setup hours and cycle time; blank means 1", () => {
  const plain = costLot(base, 10);
  assert.equal(costLot({ ...base, setupFactor: "", cycleFactor: "" }, 10).cost, plain.cost);
  const r = costLot({ ...base, setupFactor: 1.5, cycleFactor: 1.2 }, 10);
  assert.equal(r.lines.setup, 150);
  assert.ok(Math.abs(r.lines.machining - 360) < 1e-9);
  assert.equal(r.lines.programming, plain.lines.programming);
  assert.ok(validate({ ...base, cycleFactor: 0 }).length);
  assert.ok(validate({ ...base, setupFactor: -1 }).length);
  assert.deepEqual(validate({ ...base, setupFactor: "", cycleFactor: "1.1" }), []);
});

test("a blank program-life field charges all programming to this lot", () => {
  // the page sends "" when the field is cleared; blank means 1 lot, not some other default
  for (const v of [undefined, "", "abc"]) {
    assert.equal(costLot({ ...base, lotsOverProgramLife: v }, 10).lines.programming, 100, `lotsOverProgramLife ${JSON.stringify(v)}`);
  }
});

test("default quantity breaks match the calculator page's pre-filled breaks", () => {
  const html = readFileSync(new URL("./job-shop-quote-calculator.html", import.meta.url), "utf8");
  const m = html.match(/name="breaks"[^>]*value="([^"]*)"/);
  assert.ok(m, "breaks input with a value on the page");
  const page = m[1].split(/[ ,;]+/).map(Number);
  assert.deepEqual(DEFAULT_BREAKS, page);
  assert.deepEqual(quoteBreaks(base).map((r) => r.quantity), page);
});
