import { test } from "node:test";
import assert from "node:assert/strict";
import { EU14, US9, analyse, analyseDish, parseDishes, readIngredient, splitTopLevel, emphasise, labelFor, matrixCsv, EXAMPLE } from "./calc.mjs";

const one = (body, region = "uk", may = []) => analyseDish({ name: "T", body, may }, region);
const declared = (body, region) => one(body, region).declaredKeys;
const checked = (body, region) => one(body, region).checkKeys;

test("the lists are the 14 UK/EU and the 9 US allergens", () => {
  assert.equal(EU14.length, 14);
  assert.equal(US9.length, 9);
  assert.deepEqual(EU14.map((x) => x[0]).sort(), ["celery", "crustaceans", "eggs", "fish", "gluten", "lupin", "milk", "molluscs", "mustard", "peanuts", "sesame", "soya", "sulphites", "treenuts"]);
});

test("splits only at top-level commas", () => {
  assert.deepEqual(splitTopLevel("a, b (c, d), e [milk, soya]; f"), ["a", "b (c, d)", "e [milk, soya]", "f"]);
});

test("named ingredients, one per allergen", () => {
  assert.deepEqual(declared("whole milk"), ["milk"]);
  assert.deepEqual(declared("king prawns"), ["crustaceans"]);
  assert.deepEqual(declared("mussels, squid"), ["molluscs"]);
  assert.deepEqual(declared("anchovies"), ["fish"]);
  assert.deepEqual(declared("tahini"), ["sesame"]);
  assert.deepEqual(declared("celeriac"), ["celery"]);
  assert.deepEqual(declared("lupin flour"), ["lupin"]);
  assert.deepEqual(declared("Dijon mustard"), ["mustard"]);
  assert.deepEqual(declared("tofu"), ["soya"]);
  assert.deepEqual(declared("sulphur dioxide"), ["sulphites"]);
  assert.deepEqual(declared("hazelnuts"), ["treenuts"]);
  assert.deepEqual(declared("groundnuts"), ["peanuts"]);
});

test("sub-ingredients in brackets are read", () => {
  assert.deepEqual(declared("dressing (egg yolk, anchovy, mustard)"), ["eggs", "fish", "mustard"]);
});

test("look-alikes that are not allergens", () => {
  assert.deepEqual(declared("coconut milk, coconut cream, almond milk".replace(", almond milk", "")), []);
  assert.deepEqual(declared("cocoa butter, shea butter, butternut squash, butter beans"), []);
  assert.deepEqual(declared("aubergine, eggplant"), []);
  assert.deepEqual(declared("cream of tartar"), []);
  assert.deepEqual(declared("nutmeg, coconut, water chestnuts"), []);
  assert.deepEqual(declared("rice flour, corn flour, chickpea flour"), []);
  assert.deepEqual(declared("buckwheat"), [], "buckwheat is not a cereal containing gluten");
  assert.deepEqual(declared("oat milk").sort(), ["gluten"], "oats are a gluten cereal under EU labelling");
  assert.deepEqual(declared("soya-free sausage").includes("soya"), false);
  assert.deepEqual(declared("egg-free mayonnaise").includes("eggs"), false);
});

test("plant milks are the plant, not milk", () => {
  assert.deepEqual(declared("almond milk"), ["treenuts"]);
  assert.deepEqual(declared("soy milk"), ["soya"]);
});

test("flour: plain is wheat, rice is not, bare 'flour' is a check", () => {
  assert.deepEqual(declared("plain flour"), ["gluten"]);
  assert.deepEqual(declared("self-raising flour"), ["gluten"]);
  assert.deepEqual(declared("flour"), []);
  assert.deepEqual(checked("flour"), ["gluten"]);
  assert.deepEqual(checked("rice noodles"), []);
  assert.deepEqual(checked("gluten-free bread"), []);
  assert.deepEqual(checked("pasta"), ["gluten"]);
});

test("composites that usually contain an allergen are 'check', and a named one wins", () => {
  assert.deepEqual(checked("hummus"), ["sesame"]);
  assert.deepEqual(checked("hummus, tahini"), []);
  assert.deepEqual(declared("hummus, tahini"), ["sesame"]);
  assert.deepEqual(checked("worcestershire sauce").sort(), ["fish", "gluten"]);
  assert.deepEqual(checked("dried apricots"), ["sulphites"]);
});

test("a supplier tag states the allergens and a none tag clears the guesses", () => {
  assert.deepEqual(declared("Brand X pesto [milk, tree nuts]"), ["milk", "treenuts"]);
  assert.deepEqual(checked("Brand X pesto [milk, tree nuts]"), []);
  assert.deepEqual(declared("Brand X dressing [none]"), []);
  assert.deepEqual(checked("hummus [none]"), []);
  const r = readIngredient("sauce [dairy, shellfish]");
  assert.deepEqual([...r.found.keys()].sort(), ["crustaceans", "milk"]);
  const bad = one("sauce [unicorn]");
  assert.ok(bad.errors.some((e) => /unicorn/.test(e)));
});

test("a stated wheat tag counts as gluten in the UK list and wheat in the US list", () => {
  assert.deepEqual(declared("seasoning [wheat]"), ["gluten"]);
  assert.deepEqual(declared("seasoning [wheat]", "us"), ["wheat"]);
});

test("US list: rye and barley are not wheat; molluscs and celery are not US major allergens", () => {
  assert.deepEqual(declared("rye bread", "us"), []);
  assert.deepEqual(declared("barley, mussels, celery, mustard", "us"), []);
  assert.deepEqual(declared("wheat flour, milk, eggs, sesame seeds", "us"), ["milk", "eggs", "wheat", "sesame"].sort((a, b) => US9.map((x) => x[0]).indexOf(a) - US9.map((x) => x[0]).indexOf(b)));
});

test("may=… adds precautionary allergens that are not already declared", () => {
  const r = one("butter, bread", "uk", ["milk", "peanuts", "sesame"]);
  assert.deepEqual(r.mayKeys, ["peanuts", "sesame"]);
});

test("advisories are not declarations", () => {
  const r = one("pine nuts, nutmeg, coconut");
  assert.deepEqual(r.declaredKeys, []);
  assert.equal(r.advisories.length, 3);
  assert.equal(one("coconut milk").advisories.length, 0);
});

test("parseDishes: headings, may=, bullets, errors", () => {
  const p = parseDishes("# Soup | may=celery, nuts\n- carrot\n- milk\n\n// note\n# Pie | colour=red\nflour\nstray");
  assert.equal(p.dishes.length, 2);
  assert.equal(p.dishes[0].body, "carrot, milk");
  assert.deepEqual(p.dishes[0].may, ["celery", "treenuts"]);
  assert.ok(p.errors.some((e) => /colour=red/.test(e)));
  assert.deepEqual(parseDishes("loose text").errors.length, 1);
  assert.ok(parseDishes("# Soup | may=unicorn\nx").errors.some((e) => /unicorn/.test(e)));
  assert.ok(analyse("# Empty").errors.some((e) => /no ingredients/.test(e)));
});

test("emphasise bolds allergen words and escapes HTML", () => {
  assert.equal(emphasise("Wheat flour, MILK, <b>x</b>"), "<strong>Wheat</strong> flour, <strong>MILK</strong>, &lt;b&gt;x&lt;/b&gt;");
  assert.doesNotMatch(emphasise("butternut squash"), /<strong>/ ); // butter is not a whole word there
});

test("label: tags are removed from the printed ingredients and contains is listed", () => {
  const r = one("wheat flour, pesto [milk, tree nuts], olive oil");
  const l = labelFor(r);
  assert.equal(l.ingredientsText, "wheat flour, pesto, olive oil");
  assert.match(l.ingredientsHtml, /<strong>wheat<\/strong>/);
  assert.deepEqual(l.contains, ["Cereals containing gluten", "Milk", "Tree nuts"]);
});

test("the example runs, has no errors and the matrix csv has one row per dish", () => {
  const a = analyse(EXAMPLE);
  assert.equal(a.errors.length, 0);
  assert.equal(a.results.length, 5);
  const csv = matrixCsv(a).split("\n");
  assert.equal(csv.length, 6);
  assert.equal(csv[0].split('","').length, 15);
  const wrap = a.results[0];
  assert.deepEqual(wrap.declaredKeys, ["eggs", "fish", "milk", "mustard"]);
  assert.deepEqual(wrap.checkKeys, ["gluten"]);
});

test("normalisation: accents and case", () => {
  assert.deepEqual(declared("CRÈME FRAÎCHE"), ["milk"]);
  assert.deepEqual(declared("Gruyère"), ["milk"]);
});

test("label names follow the chosen list", () => {
  const r = one("egg, prawns");
  assert.deepEqual(labelFor(r, "uk").contains, ["Crustaceans", "Eggs"]);
  assert.deepEqual(labelFor(one("egg, prawns", "us"), "us").contains, ["Egg", "Crustacean shellfish"].sort((a, b) => US9.map((x) => x[1]).indexOf(a) - US9.map((x) => x[1]).indexOf(b)));
});

// Quality round 59 (portfolio/quality/audits/2026-11-13-allergen-label-maker.json): names the
// audit found missing entirely, checked against FALCPA/FASTER, EU 1169/2011 Annex II and FDA's tree-nut list.
test("common allergen names the round-59 audit found missed are declared", () => {
  assert.deepEqual(declared("oatmeal"), ["gluten"]);
  assert.deepEqual(declared("farina"), ["gluten"]);
  assert.deepEqual(declared("farina", "us"), ["wheat"]);
  assert.deepEqual(declared("cous cous"), ["gluten"]);
  assert.deepEqual(declared("cheese curds"), ["milk"]);
  assert.deepEqual(declared("lactalbumin"), ["milk"]);
  for (const f of ["salmon roe", "caviar", "smoked eel", "carp", "pike", "perch", "grouper", "mahi mahi", "taramasalata"]) {
    assert.deepEqual(declared(f), ["fish"], f);
  }
  assert.deepEqual(declared("filberts"), ["treenuts"]);
  // "oatmeal, roe" used to give an empty Contains line
  assert.deepEqual(declared("oatmeal, roe").sort(), ["fish", "gluten"]);
});

test("generic 'shellfish' and 'nuts' are flagged to check, without catching pine nuts or nut-free", () => {
  assert.deepEqual(checked("shellfish stock").sort(), ["crustaceans", "molluscs"]);
  assert.deepEqual(checked("chopped nuts"), ["treenuts"]);
  assert.deepEqual(checked("pine nuts"), []);
  assert.deepEqual(checked("nut-free spread"), []);
  assert.ok(!declared("bean curds").includes("milk")); // tofu, not cheese curds
});

test("a [none] tag clears guesses but never an allergen named outright", () => {
  assert.deepEqual(declared("milk [none]"), ["milk"]);
  assert.deepEqual(checked("hummus [none]"), []);
});
