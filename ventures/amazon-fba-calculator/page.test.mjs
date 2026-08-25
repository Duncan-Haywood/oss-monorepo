import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const seo = readFileSync(new URL("./low-inventory-level-fee.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("calculator page keeps the low-inventory fields and result targets outside any textarea", () => {
  assert.ok(!html.includes("<textarea"), "this page has no textarea that can swallow the app");
  for (const id of [
    "onHandUnits",
    "soldLast30Days",
    "soldLast90Days",
    "lowInventoryFee",
    "newFnskuExempt",
    "lilFee",
    "lilDays",
    "lilCompare",
    "lilSummary",
    "lilPayback",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /low_inventory_compared/);
  assert.match(html, /low-inventory-level-fee\.html/);
});

test("SEO page and sitemap name the restock decision", () => {
  assert.match(seo, /low-inventory-level fee/i);
  assert.match(seo, /28 days/);
  assert.match(seo, /No warranty/);
  assert.match(sitemap, /low-inventory-level-fee\.html/);
});
