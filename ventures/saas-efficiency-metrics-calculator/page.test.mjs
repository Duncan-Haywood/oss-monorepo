import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { efficiencyOutcome } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const ids = ["revenue", "prior-revenue", "net-burn", "net-new-arr", "prior-sm", "year-ago-revenue", "cash"];

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

test("page documents the formulas and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /net burn \/ net new ARR/);
  assert.match(html, /Not modelled/);
  assert.match(html, /rules of thumb, not standards/);
});

test("worked example on the page produces a burn multiple, as the page claims", () => {
  const r = efficiencyOutcome({ revenue: 1500000, priorRevenue: 1300000, netBurn: 900000, priorSalesMarketing: 600000, yearAgoRevenue: 900000, cash: 5400000 });
  assert.equal(r.burnMultiple.toFixed(2), "1.13");
  assert.equal(r.runwayMonths, 18);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("footer links the sibling tool investor-update-builder", () => {
  assert.match(page("index.html"), /href="\.\.\/investor-update-builder\/"/);
});
