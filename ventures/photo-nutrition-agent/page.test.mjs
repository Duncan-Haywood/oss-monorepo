import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("index carries the no-warranty clause and says it is not medical advice", () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /not medical, nutritional or dietary advice/);
});

test("index is honest about prototype status", () => {
  assert.match(html, /Prototype/);
  assert.match(html, /not yet run on a device/);
});

test("index links one hop to the cheap-meal-plan-optimizer sibling", () => {
  assert.match(html, /href="\.\.\/cheap-meal-plan-optimizer\/"/, "index must link ../cheap-meal-plan-optimizer/ so readers reach meal planning in one hop");
  assert.match(html, /cheap meal plan optimizer/i);
});
