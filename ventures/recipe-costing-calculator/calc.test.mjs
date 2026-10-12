import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, EXAMPLE_PANTRY, EXAMPLE_RECIPES, num, money, pct, parseQty, parsePantry, parseRecipes, lineCost, costRecipes, analyze, priceShock, roundPrice } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("num reads money, percents and fractions, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("1/2"), 0.5);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(pct(0.305), "30.5%");
});

test("parseQty handles units, aliases, mixed numbers and bare counts", () => {
  assert.deepEqual(parseQty("500 g"), { qty: 500, unit: "g" });
  assert.deepEqual(parseQty("500g"), { qty: 500, unit: "g" });
  assert.deepEqual(parseQty("1 1/2 cups"), { qty: 1.5, unit: "cup" });
  assert.deepEqual(parseQty("2 fl oz"), { qty: 2, unit: "floz" });
  assert.deepEqual(parseQty("12"), { qty: 12, unit: "each" });
  assert.deepEqual(parseQty("3 eggs"), { qty: 3, unit: "each" });
  assert.equal(parseQty("two cups"), null);
  assert.equal(parseQty("5 parsecs"), null);
});

test("a pound of butter at $4.60: 8 oz costs $2.30", () => {
  const { items } = parsePantry("Butter, 1 lb, 4.60");
  near(lineCost(items.get("butter"), 8, "oz").cost, 2.3);
  near(lineCost(items.get("butter"), 1, "lb").cost, 4.6);
  near(lineCost(items.get("butter"), 453.59237, "g").cost, 4.6);
});

test("trim yield raises the cost of what you actually use", () => {
  const { items } = parsePantry("Walnuts, 5 lb, 31.50, 92");
  near(lineCost(items.get("walnuts"), 1, "lb").cost, (31.5 / 5) / 0.92);
});

test("weight to volume needs a density, and says so when missing", () => {
  const { items } = parsePantry("Flour, 25 lb, 14.50, 100, 0.53\nHoney, 12 lb, 40");
  // 1 cup = 236.588 ml * 0.53 g/ml = 125.39 g of a 11339.8 g pack
  near(lineCost(items.get("flour"), 1, "cup").cost, (125.3919 / 11339.8) * 14.5, 0.001);
  assert.match(lineCost(items.get("honey"), 1, "cup").error, /density/);
});

test("a pack bought by volume can be used by weight with a density", () => {
  const { items } = parsePantry("Olive oil, 1 l, 12, 100, 0.92");
  near(lineCost(items.get("olive oil"), 92, "g").cost, 1.2, 0.001);
});

test("count packs: a dozen eggs from a 15-dozen case", () => {
  const { items } = parsePantry("Eggs, 15 dozen, 41");
  near(lineCost(items.get("eggs"), 1, "dozen").cost, 41 / 15, 0.001);
  near(lineCost(items.get("eggs"), 4, "each").cost, (41 / 180) * 4, 0.001);
  assert.match(lineCost(items.get("eggs"), 1, "cup").error, /cannot be converted/);
});

test("pantry parser reports bad lines instead of dropping them silently", () => {
  const { items, errors } = parsePantry("Flour, 25 lb\nSugar, lots, 5\nSalt, 3 lb, 2.4, 0\nGood, 1 kg, 3");
  assert.equal(items.size, 1);
  assert.equal(errors.length, 3);
});

test("recipe parser reads headings, settings and sub-recipe lines", () => {
  const { recipes, errors } = parseRecipes("# Cake | portions=12 | price=4 | labor=30 | pack=0.1\nFlour, 1 cup\n@Icing, 6 portion\nSugar");
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].portions, 12);
  assert.equal(recipes[0].price, 4);
  assert.equal(recipes[0].lines.length, 2);
  assert.equal(recipes[0].lines[1].sub, true);
  assert.equal(errors.length, 1);
  assert.match(parseRecipes("Flour, 1 cup").errors[0], /start with/);
});

test("cost of a hand-checked recipe: batch, portion, food cost, labor", () => {
  const pantry = "Flour, 10 lb, 10\nButter, 1 lb, 5";
  const rec = "# Shortbread | portions=20 | price=2 | labor=30 | pack=0.1\nFlour, 1 lb\nButter, 8 oz";
  const a = analyze(pantry, rec, { laborRate: 20, targetFoodCostPct: 25 });
  const r = a.results[0];
  assert.deepEqual(a.errors, []);
  near(r.ingredientCost, 1 + 2.5);
  near(r.laborCost, 10);
  near(r.packagingCost, 2);
  near(r.batchCost, 15.5);
  near(r.perPortion, 0.775);
  near(r.foodPerPortion, 5.5 / 20);
  near(r.suggestedPrice, 0.275 / 0.25);
  assert.equal(r.suggestedRounded, 1.25);
  near(r.foodCostPct, 0.275 / 2, 1e-9);
  near(r.marginPerPortion, 2 - 0.775);
  assert.equal(r.overTarget, false);
});

test("sub-recipes roll their cost up per portion and per batch", () => {
  const pantry = "Sugar, 1 lb, 2";
  const rec = "# Syrup | portions=4\nSugar, 1 lb\n# Drink | portions=1\n@Syrup, 2 portion\n@Syrup, 1 batch";
  const r = analyze(pantry, rec).results;
  near(r[0].perPortion, 0.5);
  near(r[1].ingredientCost, 1 + 2);
});

test("a sub-recipe loop and an undefined sub-recipe are reported", () => {
  const loop = analyze("Sugar, 1 lb, 2", "# A | portions=1\n@B, 1 batch\n# B | portions=1\n@A, 1 batch");
  assert.ok(loop.errors.some((e) => /loop/.test(e)));
  const miss = analyze("Sugar, 1 lb, 2", "# A | portions=1\n@Nope, 1 batch\nSugar, 1 oz");
  assert.ok(miss.errors.some((e) => /not defined/.test(e)));
});

test("unknown ingredients and unit mismatches surface as errors, not zeros", () => {
  const a = analyze("Flour, 10 lb, 10", "# X | portions=2\nFlour, 1 cup\nMystery, 1 g");
  assert.equal(a.errors.length, 2);
});

test("over-target flag and ranked drivers", () => {
  const a = analyze("A, 1 lb, 10\nB, 1 lb, 1", "# X | portions=1 | price=5\nA, 1 lb\nB, 1 lb", { targetFoodCostPct: 30 });
  const r = a.results[0];
  assert.equal(r.overTarget, true);
  assert.equal(r.ranked[0].name, "A");
  near(r.ranked[0].share, 10 / 11, 1e-9);
  near(priceShock(r)[0].perPortion, 1, 1e-9);
});

test("roundPrice rounds up to the next step and survives bad steps", () => {
  assert.equal(roundPrice(3.01, 0.25), 3.25);
  assert.equal(roundPrice(3.25, 0.25), 3.25);
  assert.equal(roundPrice(3.01, 0), 3.01);
});

test("the built-in example costs cleanly with no errors", () => {
  const a = analyze(EXAMPLE_PANTRY, EXAMPLE_RECIPES, DEFAULTS);
  assert.deepEqual(a.errors, []);
  assert.equal(a.results.length, 2);
  const brownie = a.results[1];
  assert.ok(brownie.perPortion > 0.3 && brownie.perPortion < 3, String(brownie.perPortion));
  assert.ok(brownie.lines.some((l) => l.sub));
});

test("costRecipes is order-independent for sub-recipes", () => {
  const p = parsePantry("Sugar, 1 lb, 2").items;
  const { recipes } = parseRecipes("# Top | portions=1\n@Base, 1 batch\n# Base | portions=2\nSugar, 1 lb");
  near(costRecipes(p, recipes)[0].batchCost, 2);
});
