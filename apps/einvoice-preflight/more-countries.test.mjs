import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { HUB, REGIONS, COUNTRY_COUNT, countryPages, drift, moreCountries } from "./more-countries.mjs";

const DIR = new URL("./", import.meta.url);
const LISTED = REGIONS.flatMap(([, links]) => links.map(([href]) => href));
const LABELS = REGIONS.flatMap(([, links]) => links.map(([, label]) => label));

test("every country page's More countries block matches REGIONS (run more-countries.mjs --write)", () => {
  assert.deepEqual(drift(), []);
});

test("REGIONS lists every country page once, and only pages that exist", () => {
  const pages = countryPages();
  assert.equal(new Set(LISTED).size, LISTED.length, "a page is listed twice");
  assert.equal(new Set(LABELS).size, LABELS.length, "two pages share a label");
  for (const href of LISTED) assert.ok(pages.includes(href), `${href} is listed but missing`);
  assert.deepEqual(pages.filter((p) => !LISTED.includes(p)), [], "a country page no block links to: add it to REGIONS");
  assert.equal(COUNTRY_COUNT, pages.length);
});

test("a page's block never links to itself, and always links the by-country hub", () => {
  const block = moreCountries("germany-e-invoice-mandate.html");
  assert.doesNotMatch(block, /href="germany-e-invoice-mandate\.html"/);
  assert.match(block, /href="france-e-invoice-mandate\.html"[^>]*>France</);
  assert.ok(block.includes(`href="${HUB}"`));
  assert.equal((block.match(/-e-invoice-mandate\.html"/g) || []).length, COUNTRY_COUNT - 1);
});

test("the by-country hub links every country page", () => {
  const hub = readFileSync(new URL(HUB, DIR), "utf8");
  for (const href of LISTED) assert.ok(hub.includes(`href="${href}"`), `${HUB} has no link to ${href}`);
});

test("each label is the country the page is about (its <title> starts with it, give or take)", () => {
  const alias = { "United Kingdom": "UK", "United Arab Emirates": "UAE", "Czech Republic": "Czech", "Switzerland": "Switzerland" };
  for (const [, links] of REGIONS) for (const [href, label] of links) {
    const title = readFileSync(new URL(href, DIR), "utf8").match(/<title>([^<]*)/)[1].replace(/&#x27;/g, "'");
    const want = alias[label] || label;
    assert.ok(title.startsWith(want) || title.includes(want), `${href}: label "${label}" not in title "${title}"`);
  }
});
