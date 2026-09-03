import assert from "node:assert/strict";
import test from "node:test";
import { deleteScenario, listScenarios, saveScenario } from "./scenarios.mjs";

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}

test("saves newest named scenario and replaces duplicate names", () => {
  const store = storage();
  saveScenario(store, "Spring SKU", { salePrice: "29.99" });
  const scenarios = saveScenario(store, " spring sku ", { salePrice: "34.99" });
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].inputs.salePrice, "34.99");
});

test("limits saved scenarios and deletes by opaque id", () => {
  const store = storage();
  for (let index = 0; index < 21; index += 1) saveScenario(store, `SKU ${index}`, { index });
  const scenarios = listScenarios(store);
  assert.equal(scenarios.length, 20);
  assert.equal(deleteScenario(store, scenarios[0].id).length, 19);
});
