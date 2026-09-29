import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["home-sqft", "office-sqft", "months-used", "first-year-month", "gross-income", "other-expenses",
  "mortgage-interest", "property-tax", "rent", "utilities", "insurance", "repairs", "other-indirect",
  "direct-expenses", "home-basis", "land-value", "carry-operating", "carry-depreciation", "marginal-rate"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every input has an id and a visible label", () => {
  const html = page("index.html");
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for ${id}`);
  }
});

test("page states the IRS figures and the employee exclusion", () => {
  const html = page("index.html");
  assert.match(html, /\$5 per square foot/);
  assert.match(html, /300/);
  assert.match(html, /\$1,500/);
  assert.match(html, /Employees cannot deduct/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
