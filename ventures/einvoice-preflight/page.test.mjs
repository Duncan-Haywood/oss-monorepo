import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = readFileSync(new URL("./robots.txt", import.meta.url), "utf8");

test("browser page is discoverable and names the user job", () => {
  assert.match(page, /<title>E-invoice Preflight/);
  assert.match(page, /meta name="description"/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Catch invoice defects before you submit/);
  assert.match(page, /INV-022 through INV-027/);
  assert.match(page, /INV-028 and INV-029/);
  assert.match(page, /INV-030 and INV-031/);
  assert.match(page, /INV-032 through INV-034/);
  assert.match(page, /Load a credit note without a reference/);
});

test("disclaimer and optional sponsors are visible", () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not legal, tax, financial, or accounting advice/i);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(page, /never changes what the tool does/);
});

test("sitemap and robots list the browser page", () => {
  assert.match(sitemap, /einvoice-preflight\/index.html/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: sitemap.xml/);
});
