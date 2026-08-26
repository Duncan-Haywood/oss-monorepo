import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const explainer = readFileSync(new URL("./doordash-fees-for-restaurants.html", import.meta.url), "utf8");

test("landing page names the restaurant search phrases and the job", () => {
  assert.match(page, /DoorDash Fee Calculator for Restaurants/);
  assert.match(page, /menu price each app needs to match dine-in/);
  assert.match(page, /<title>/);
  assert.match(page, /meta name="description"/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /FAQPage/);
});

test("landing page is a complete calculator, not a placeholder", () => {
  assert.match(page, /id="ticketPrice"/);
  assert.match(page, /id="foodCost"/);
  assert.match(page, /id="rows"/);
  assert.match(page, /from "\.\/calc\.mjs"/);
  assert.match(page, /Price to match dine-in/);
});

test("disclaimer, privacy, opt-out, and optional sponsors are visible", () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not tax, financial, or business advice/i);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Do Not Track/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
});

test("explainer page walks the same default ticket the calculator ships", () => {
  assert.match(explainer, /\$21\.17/);
  assert.match(explainer, /\$10\.11/);
  assert.match(explainer, /\$47\.15/);
  assert.match(explainer, /\$4,424/);
  assert.match(explainer, /No warranty/);
});
