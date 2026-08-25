import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, "index.html"), "utf8");
const acosPage = readFileSync(join(root, "break-even-acos.html"), "utf8");
const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");

test("calculator page exposes break-even ACOS results a seller can read", () => {
  for (const id of ["currentAcos", "breakEvenAcos", "targetMarginAcos", "adsStillPay", "adsPerUnit"]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /Break-even ACOS/);
  assert.match(page, /break-even-acos\.html/);
  assert.match(page, /break_even_acos_calculated/);
});

test("SEO page and sitemap name the ACOS question in search words", () => {
  assert.match(acosPage, /break-even ACOS/i);
  assert.match(acosPage, /No warranty/);
  assert.match(sitemap, /break-even-acos\.html/);
});
