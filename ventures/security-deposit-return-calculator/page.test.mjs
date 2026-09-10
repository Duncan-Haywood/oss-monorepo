import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("index page states this is not legal advice", () => {
  const html = page("index.html");
  assert.match(html, /not legal or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

// Reciprocal of the link in str-host-payout-calculator's footer: the same
// property owner, the other letting model.
test("index links one hop to the str-host-payout-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/str-host-payout-calculator\/"/,
    "index must link ../str-host-payout-calculator/ so a reader comparing letting models reaches it in one hop",
  );
});
