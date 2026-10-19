import { test } from "node:test";
import assert from "node:assert/strict";
import { FOOD_LIBRARY, libraryLines, lineName, addLibraryFoods } from "./food-library.mjs";
import { parseFoods, SAMPLE_FOODS, sampleSpec, solve, verifyPlan } from "./calc.mjs";

test("every library line parses with no errors", () => {
  const { foods, errors } = parseFoods(libraryLines().join("\n"));
  assert.deepEqual(errors, []);
  assert.equal(foods.length, libraryLines().length);
});

test("names are unique and do not repeat the starter foods", () => {
  const names = libraryLines().map((l) => lineName(l).toLowerCase());
  assert.equal(new Set(names).size, names.length);
  const starter = new Set(SAMPLE_FOODS.split("\n").map((l) => lineName(l).toLowerCase()));
  for (const n of names) assert.ok(!starter.has(n), n);
});

test("calories agree with 4/4/9 within 20% (catches a typo in a column)", () => {
  for (const line of libraryLines()) {
    const [name, , kcal, p, c, f] = line.split("|").map((s) => s.trim());
    const atwater = 4 * Number(p) + 4 * Number(c) + 9 * Number(f);
    assert.ok(Math.abs(atwater - Number(kcal)) <= 0.2 * Number(kcal) + 6, `${name}: ${kcal} kcal vs ${atwater.toFixed(0)} from macros`);
  }
});

test("every food has all four mineral columns filled", () => {
  for (const line of libraryLines()) {
    const cells = line.split("|").map((s) => s.trim());
    assert.equal(cells.length, 13, cells[0]);
    for (const j of [9, 10, 11, 12]) assert.notEqual(cells[j], "", `${cells[0]} column ${j + 1}`);
  }
});

test("addLibraryFoods appends, skips what is listed, and keeps the text parseable", () => {
  const first = addLibraryFoods(SAMPLE_FOODS, ["Tofu, firm (100 g)", "quinoa, dry (50 g)", "Not a food"]);
  assert.deepEqual(first.added, ["Quinoa, dry (50 g)", "Tofu, firm (100 g)"]);
  assert.equal(parseFoods(first.text).errors.length, 0);
  const again = addLibraryFoods(first.text, ["Tofu, firm (100 g)"]);
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.skipped, ["Tofu, firm (100 g)"]);
  assert.equal(again.text, first.text);
});

test("adding to an empty box works", () => {
  const r = addLibraryFoods("", ["Onion (100 g)"]);
  assert.equal(r.text, "Onion (100 g) | 0.12 | 40 | 1.1 | 9.3 | 0.1 | 1.7 |  |  | 4 | 23 | 0.2 | 146\n");
});

test("the whole library plus the starter foods still solves and verifies", () => {
  const spec = sampleSpec();
  spec.foods = parseFoods(SAMPLE_FOODS + "\n" + libraryLines().join("\n")).foods;
  const res = solve(spec);
  assert.equal(res.status, "optimal");
  assert.deepEqual(verifyPlan(spec, res), []);
});

test("library is grouped", () => {
  assert.ok(FOOD_LIBRARY.length >= 5);
  for (const g of FOOD_LIBRARY) assert.ok(g.group && g.foods.length);
});
