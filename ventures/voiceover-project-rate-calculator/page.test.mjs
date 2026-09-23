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

test("every input has an associated label", () => {
  const html = page("index.html");
  const inputTags = [...html.matchAll(/<(?:input|select)\b[^>]*>/g)].map((m) => m[0]);
  const inputIds = inputTags
    .map((tag) => tag.match(/\bid="([^"]+)"/))
    .filter(Boolean)
    .map((m) => m[1]);
  assert.ok(inputIds.length > 5, "expected several labeled fields on the page");
  for (const id of inputIds) {
    // Either an explicit <label for="id"> or the input nested inside a
    // <label>...</label> (the wrapping pattern used for the checkboxes)
    // counts as an accessible name association.
    const hasForLabel = new RegExp(`<label[^>]*for="${id}"`).test(html);
    const wrappingLabel = new RegExp(`<label[^>]*>(?:(?!</label>)[\\s\\S])*id="${id}"(?:(?!</label>)[\\s\\S])*</label>`).test(html);
    assert.ok(hasForLabel || wrappingLabel, `#${id} must have an associated label (for= or wrapping <label>)`);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

// Closest sibling by shape: both price freelance language/audio project work
// per word (or a per-word-derived unit), scaled by usage/rush terms, for one
// solo professional. Without a crawlable link here, a crawler entering on
// this calculator can never reach the translator calculator in one hop
// (platform/pages/siblings.test.mjs's orphan budget).
test("index links one hop to the translator-project-quote sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/translator-project-quote\/"/,
    "index must link ../translator-project-quote/ so crawlers reach it in one hop",
  );
  assert.match(html, /translator project quote calculator/i);
});
