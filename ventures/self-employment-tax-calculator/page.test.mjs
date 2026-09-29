import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["net-profit", "w2-wages", "filing-status", "marginal-rate"];

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

test("page states the 2026 figures", () => {
  const html = page("index.html");
  assert.match(html, /15\.3% of 92\.35%/);
  assert.match(html, /\$184,500/);
  assert.match(html, /Form 8959/);
});

test("worked example on the page matches the calculator", async () => {
  const { selfEmploymentTax } = await import("./calc.mjs");
  assert.equal(selfEmploymentTax({ netProfit: 100000 }).seTax, 14129.55);
  assert.match(page("index.html"), /\$14,129\.55/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
