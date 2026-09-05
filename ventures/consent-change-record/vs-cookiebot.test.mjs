import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./vs-cookiebot.html", import.meta.url), "utf8");

test("states both tools' scope without inventing Cookiebot pricing", () => {
  assert.match(page, /Cookiebot/);
  assert.match(page, /crawl/i);
  assert.doesNotMatch(page, /Cookiebot[^.]*\$\d/);
});

test("carries the not-affiliated disclaimer", () => {
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Cookiebot/i);
});

test("links back to the tool and the SEO explainer page", () => {
  assert.match(page, /href="\.\/"/);
  assert.match(page, /href="what-did-my-cookie-banner-actually-change\.html"/);
});

test("carries the no-warranty and nothing-leaves-your-browser clauses", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /Nothing leaves your browser/);
});

test("index.html links to the comparison page", () => {
  const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(index, /href="\.\/vs-cookiebot\.html"/);
});

test("sitemap.xml lists the comparison page", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-cookiebot\.html/);
});
