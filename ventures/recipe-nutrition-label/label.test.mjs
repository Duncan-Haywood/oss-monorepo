import { test } from "node:test";
import assert from "node:assert/strict";
import { roundAmount, roundPercentDV, servingsPerContainer, parseRecipe, buildLabel, detectAllergens, ingredientStatement, toText, toCsv, pantryLine, PANTRY, COLUMNS } from "./label.mjs";
import { SAMPLE, SAMPLE_SERVING_G, SAMPLE_YIELD_G } from "./sample.mjs";

test("calories round to 0, 5s up to 50, then 10s", () => {
  assert.deepEqual([3, 48, 52, 55, 133].map((x) => roundAmount("calories", x)), [0, 50, 50, 60, 130]);
});

test("fats round to 0, half grams under 5 g, then whole grams", () => {
  assert.deepEqual([0.4, 0.7, 0.8, 4.8, 5.4, 12.5].map((x) => roundAmount("fat", x)), [0, 0.5, 1, 5, 5, 13]);
});

test("cholesterol, sodium and grams follow their own steps", () => {
  assert.deepEqual([1, 4, 7, 8].map((x) => roundAmount("cholesterol", x)), [0, "lt5", 5, 10]);
  assert.deepEqual([3, 142, 147, 20].map((x) => roundAmount("sodium", x)), [0, 140, 150, 20]);
  assert.deepEqual([0.4, 0.7, 1.4, 19.5].map((x) => roundAmount("carbs", x)), [0, "lt1", 1, 20]);
});

test("percent DV: whole percent for macros, 2/5/10 steps for vitamins and minerals", () => {
  assert.equal(roundPercentDV("sodium", 25.4), 25);
  assert.equal(roundPercentDV("vitD", 7), 8);
  assert.deepEqual([12, 13, 64, 66].map((p) => roundPercentDV("calcium", p)), [10, 15, 60, 70]);
});

test("servings per container", () => {
  assert.equal(servingsPerContainer(640, 30), 21);
  assert.equal(servingsPerContainer(250, 100), 2.5);
  assert.equal(servingsPerContainer(150, 100), 1.5);
});

test("parseRecipe handles header, quotes, comments and bad lines", () => {
  const { ingredients, warnings } = parseRecipe(`name,grams,calories\n# note\n"Chocolate, dark",50,500,30,18,0,5,10,50,8,30,25,6,0,20,5,500\nbad line\nFlour,abc`);
  assert.equal(ingredients.length, 1);
  assert.equal(ingredients[0].name, "Chocolate, dark");
  assert.equal(ingredients[0].per100.potassium, 500);
  assert.equal(warnings.filter((w) => /Skipped/.test(w)).length, 2);
});

test("blank core values are reported rather than silently zeroed", () => {
  const { warnings } = parseRecipe("Mystery,100,,,,,,,");
  assert.match(warnings.join(" "), /Mystery: no value for calories, fat, carbs, protein, sodium/);
});

test("per-serving math scales by serving over finished weight", () => {
  const { ingredients } = parseRecipe(pantryLine("Vegetable oil", 100));
  const l = buildLabel(ingredients, { servingG: 10, yieldG: 100 });
  assert.equal(l.rows.calories.amount, 90);
  assert.equal(l.rows.fat.amount, 10);
  assert.equal(l.rows.fat.dv, 13);
  assert.equal(l.warnings.length, 0);
  const noYield = buildLabel(parseRecipe(pantryLine("Vegetable oil", 100)).ingredients, { servingG: 10 });
  assert.match(noYield.warnings.join(" "), /finished/i);
});

test("a baked batch that lost water gets more per serving than raw weight would give", () => {
  const mk = () => parseRecipe(SAMPLE).ingredients;
  const raw = buildLabel(mk(), { servingG: SAMPLE_SERVING_G });
  const baked = buildLabel(mk(), { servingG: SAMPLE_SERVING_G, yieldG: SAMPLE_YIELD_G });
  assert.ok(baked.rows.calories.raw > raw.rows.calories.raw);
});

test("input checks", () => {
  const ing = parseRecipe(pantryLine("Honey", 100)).ingredients;
  assert.throws(() => buildLabel(ing, {}), /serving size/);
  assert.throws(() => buildLabel([], { servingG: 10 }), /no ingredients/);
  assert.match(buildLabel(ing, { servingG: 10, yieldG: 500 }).warnings.join(" "), /more than the ingredients weigh/);
  assert.match(buildLabel(ing, { servingG: 500, yieldG: 100 }).warnings.join(" "), /larger than the whole batch/);
});

test("typos in a row trigger consistency warnings", () => {
  const { ingredients } = parseRecipe("Oops,100,900,1,5,0,0,0,10,0,50,5,2,0,0,0,0");
  const w = buildLabel(ingredients, { servingG: 100, yieldG: 100 }).warnings.join(" ");
  assert.match(w, /Saturated fat is higher/);
  assert.match(w, /Total sugars are higher|Fiber plus sugars/);
  assert.match(w, /Calories .* differ/);
});

test("allergen detection avoids plant-milk, cocoa butter and eggplant false positives", () => {
  const f = (n) => Object.keys(detectAllergens([n]).found);
  assert.deepEqual(f("Coconut milk"), []);
  assert.deepEqual(f("Almond milk"), ["Tree nuts"]);
  assert.deepEqual(f("Soy milk"), ["Soybeans"]);
  assert.deepEqual(f("Cocoa butter"), []);
  assert.deepEqual(f("Eggplant"), []);
  assert.deepEqual(f("Buckwheat flour"), []);
  assert.deepEqual(f("Peanut butter"), ["Peanuts"]);
  assert.deepEqual(f("Unsalted butter"), ["Milk"]);
  assert.deepEqual(f("Tahini"), ["Sesame"]);
  assert.deepEqual(f("Shrimp"), ["Crustacean shellfish"]);
  assert.deepEqual(f("Nutmeg"), []);
});

test("bare flour is treated as wheat with a note; vague nuts and flavors get notes", () => {
  const r = detectAllergens(["Flour", "Mixed nuts", "Natural flavor"]);
  assert.ok(r.found.Wheat);
  assert.equal(r.notes.length, 3);
});

test("ingredient statement lists by weight, merging repeats", () => {
  const ing = [{ name: "sugar", grams: 10 }, { name: "Flour", grams: 50 }, { name: "Sugar", grams: 5 }];
  assert.equal(ingredientStatement(ing), "Ingredients: Flour, sugar.");
});

test("sample recipe makes a plausible, internally consistent label", () => {
  const { ingredients, warnings } = parseRecipe(SAMPLE);
  assert.equal(warnings.length, 0);
  const l = buildLabel(ingredients, { servingG: SAMPLE_SERVING_G, yieldG: SAMPLE_YIELD_G });
  assert.equal(l.warnings.length, 0);
  assert.ok(l.rows.calories.amount >= 100 && l.rows.calories.amount <= 160);
  assert.match(l.allergenStatement, /Wheat/);
  assert.match(l.allergenStatement, /Milk/);
  assert.match(l.allergenStatement, /Eggs/);
  const text = toText(l);
  assert.match(text, /Nutrition Facts/);
  assert.match(text, /Includes .* Added Sugars/);
  assert.match(toCsv(l), /^Nutrient,Per serving/);
});

test("pantry rows are complete and internally consistent", () => {
  for (const p of PANTRY) {
    for (const c of COLUMNS) assert.equal(typeof p.per100[c], "number", `${p.name} ${c}`);
    assert.ok(p.per100.satFat <= p.per100.fat + 0.01, p.name);
    assert.ok(p.per100.addedSugars <= p.per100.sugars + 0.01, p.name);
    assert.ok(p.per100.sugars + p.per100.fiber <= p.per100.carbs + 0.5, p.name);
  }
  assert.throws(() => pantryLine("Unobtainium", 5), /not in the pantry/);
});
