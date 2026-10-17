import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["agi", "filing-status", "target-rate", "seniors", "balance", "deduction"];

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

test("page states the 2026 traps", () => {
  const html = page("index.html");
  assert.match(html, /IRMAA/);
  assert.match(html, /\$109,000/);
  assert.match(html, /senior/i);
});

test("worked example on the page matches the calculator", async () => {
  const { rothConversion } = await import("./calc.mjs");
  assert.equal(rothConversion({ agi: 60000, targetRate: 0.22 }).conversion, 61800);
  assert.match(page("index.html"), /Converts \$61,800/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("page links to the Medicare IRMAA cliff calculator, which links back", () => {
  assert.match(page("index.html"), /href="\.\.\/medicare-irmaa-cliff-calculator\/"/);
  assert.match(page("../medicare-irmaa-cliff-calculator/index.html"), /href="\.\.\/roth-conversion-bracket-fill-calculator\/"/);
});
