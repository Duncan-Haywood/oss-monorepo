import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareQuotes, cheapestByQuantity, comparisonCsv } from "./quotes.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";
import { newDesign, applyOp } from "./design.mjs";
import { unitCost } from "./costing.mjs";

const design = () => { const d = newDesign(); d.quantity = 100; return d; };
const sheet = (name, o = {}) => ({ ...structuredClone(EXAMPLE_SUPPLIER), example: false, name, ...o });

test("each row equals the single-sheet costing", () => {
  const d = design();
  const a = sheet("A"), b = sheet("B", { cutAndSew: { tee: 3, longsleeve: 5, crewneck: 7, hoodie: 9 } });
  const c = compareQuotes(d, [a, b]);
  assert.equal(c.rows[0].landed, unitCost(d, a).landed);
  assert.equal(c.rows[1].landed, unitCost(d, b).landed);
  assert.equal(c.best.landed, 1);
});

test("a sheet below its MOQ never wins, and is flagged", () => {
  const d = design();
  const cheap = sheet("Cheap", { moq: 500, cutAndSew: { tee: 1, longsleeve: 1, crewneck: 1, hoodie: 1 } });
  const c = compareQuotes(d, [sheet("A"), cheap]);
  assert.equal(c.best.landed, 0);
  assert.ok(c.warnings.some(w => w.includes("minimum order of 500")));
});

test("a sheet missing a price says so instead of guessing", () => {
  const d = design();
  const bad = sheet("Bad"); delete bad.cutAndSew.tee;
  const c = compareQuotes(d, [sheet("A"), bad]);
  assert.equal(c.rows[1].ok, false);
  assert.ok(c.warnings.some(w => w.includes("cut and sew price for tee")));
  assert.equal(c.best.landed, 0);
});

test("mixed currencies pick no winner", () => {
  const c = compareQuotes(design(), [sheet("A"), sheet("B", { currency: "USD" })]);
  assert.equal(c.comparable, false);
  assert.equal(c.best.landed, null);
});

test("the example sheet is called out as not a quote", () => {
  const c = compareQuotes(design(), [EXAMPLE_SUPPLIER, sheet("B")]);
  assert.ok(c.warnings.some(w => w.includes("placeholder")));
});

test("a setup-heavy sheet with cheaper units wins only past a crossover", () => {
  const d = design(); d.placements = [{ id: 1, kind: "text", label: "logo", method: "screen", area: 100 }];
  const lowUnit = sheet("LowUnit", { cutAndSew: { tee: 2, longsleeve: 5, crewneck: 7, hoodie: 9 }, methods: Object.fromEntries(Object.entries(EXAMPLE_SUPPLIER.methods).map(([k, v]) => [k, { setup: v.setup + 400, perUnit: v.perUnit }])) });
  const rows = cheapestByQuantity(d, [sheet("A"), lowUnit], [50, 100, 2500]);
  assert.equal(rows[0].cheapest, 0);
  assert.equal(rows[2].cheapest, 1);
  assert.ok(rows[2].saving > 0);
});

test("csv neutralises formula-looking supplier names", () => {
  const csv = comparisonCsv(compareQuotes(design(), [sheet("=HYPERLINK(1)"), sheet("B")]));
  assert.ok(csv.includes("'=HYPERLINK(1)"));
  assert.equal(csv.trim().split("\n").length, 3);
});

test("quotes.html is wired up and says it ships no prices", () => {
  const html = readFileSync(new URL("./quotes.html", import.meta.url), "utf8");
  assert.ok(html.includes("quotes.mjs"));
  assert.ok(/not a quote|your own quotes|no prices/i.test(html));
  assert.ok(html.includes('rel="canonical"') || html.includes("<title>"));
});
