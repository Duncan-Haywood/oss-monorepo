// A shared link that quietly loses a field is worse than no link at all: the
// reader lands on a page showing this calculator's defaults as if they were
// their own numbers, and prices a listing on them. Nothing goes red. So the
// round-trip below is driven by the calculator's own field list, and a
// separate test checks that list against the page's actual inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { decodeInputs, encodeInputs, ENUM_FIELDS } from "./share.mjs";
import { FULFILLMENT_VALUES, INPUT_FIELDS, CATEGORY_PRESETS, STORAGE_PRESETS } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("round-trips every numeric field the calculator accepts", () => {
  const scenario = Object.fromEntries(INPUT_FIELDS.map((field, index) => [field, index + 1]));
  assert.deepEqual(decodeInputs(encodeInputs(scenario)), scenario);
});

test("round-trips the fulfilment path, which decides which column is the answer", () => {
  for (const method of FULFILLMENT_VALUES) {
    assert.equal(decodeInputs(encodeInputs({ fulfillmentMethod: method })).fulfillmentMethod, method);
  }
});

test("round-trips category and storage-season labels alongside the rates they filled", () => {
  for (const category of Object.keys(CATEGORY_PRESETS)) {
    assert.equal(decodeInputs(encodeInputs({ category })).category, category);
  }
  for (const storageSeason of Object.keys(STORAGE_PRESETS)) {
    assert.equal(decodeInputs(encodeInputs({ storageSeason })).storageSeason, storageSeason);
  }
});

test("every field name in ENUM_FIELDS is one of INPUT_FIELDS's neighbours on the page, not a stray key", () => {
  for (const field of Object.keys(ENUM_FIELDS)) {
    assert.ok(html.includes(`id="${field}"`), `index.html has no #${field} element`);
  }
});

test("ignores unknown, negative, non-finite, malformed, and out-of-list values", () => {
  assert.deepEqual(decodeInputs("?salePrice=10&costOfGoods=-2&bogus=4&length=nope"), { salePrice: 10 });
  assert.equal(encodeInputs({ salePrice: -1, costOfGoods: Infinity, bogus: 3 }), "");
  assert.equal(decodeInputs("category=not-a-real-category").category, undefined);
  assert.equal(decodeInputs("fulfillmentMethod=drone").fulfillmentMethod, undefined);
});

test("accepts hash links without arbitrary fields", () => {
  assert.deepEqual(decodeInputs("#salePrice=22.5&otherCost=1&secret=abc"), { salePrice: 22.5, otherCost: 1 });
});

test("leaves out a blank optional field (match price) rather than pinning it to zero", () => {
  const encoded = encodeInputs({ salePrice: 24.99, matchPrice: "" });
  assert.equal(decodeInputs(encoded).matchPrice, undefined);
});

test("round-trips known numeric inputs in stable order", () => {
  const encoded = encodeInputs({ salePrice: 24.99, weightLb: 0.75, referralRate: 15 });
  assert.equal(encoded, "salePrice=24.99&referralRate=15&weightLb=0.75");
  assert.deepEqual(decodeInputs(encoded), { salePrice: 24.99, referralRate: 15, weightLb: 0.75 });
});

// This is the exact bug class the module exists to prevent: every field the
// page's own `ids` array reads and writes must be in INPUT_FIELDS, or a
// share link silently drops it the day someone adds a new input to the form
// without updating this list.
test("INPUT_FIELDS matches every input the page's own `ids` array declares", () => {
  const match = html.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(match, "index.html has no `const ids = [...]` array to check against");
  const pageIds = [...match[1].matchAll(/"([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...INPUT_FIELDS].sort(), [...pageIds].sort());
});
