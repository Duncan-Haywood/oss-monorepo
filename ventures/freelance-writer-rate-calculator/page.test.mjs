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

test("index page states this is not financial, legal, or professional advice", () => {
  const html = page("index.html");
  assert.match(html, /not financial, legal, or professional advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("index page names the core concepts and 2026 rate figures", () => {
  const html = page("index.html");
  assert.ok((html.match(/per-word/gi) || []).length >= 3, "expected 'per-word' to appear more than once");
  assert.ok((html.match(/effective hourly/gi) || []).length >= 2, "expected 'effective hourly' to appear more than once");
  assert.match(html, /\$0\.10/);
  assert.match(html, /\$0\.42\/word/);
  assert.match(html, /16-20%/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of [
    "word-count", "writing-speed", "research-hours", "revision-rounds",
    "hours-per-revision", "is-ghostwritten", "per-word-rate", "flat-fee", "target-hourly",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /writerRateOutcome/);
});

test("every input carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of [
    "word-count", "writing-speed", "research-hours", "revision-rounds",
    "hours-per-revision", "is-ghostwritten", "per-word-rate", "flat-fee", "target-hourly",
  ]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page explicitly names the research-and-revision-time trade-off", () => {
  const html = page("index.html");
  assert.match(html, /research.{0,40}revision/is);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// Cross-links its closest topical siblings so platform/pages/siblings.mjs
// --check does not flag it as a crawlable orphan on its first commit.
// freelance-retainer-calculator/index.html pins the reciprocal link back.
test("index links one hop to the freelance-retainer-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/freelance-retainer-calculator\/"/,
    'index must link ../freelance-retainer-calculator/ so crawlers reach the sibling in one hop',
  );
});

test("index links to the freelance-platform-fee-calculator sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/freelance-platform-fee-calculator\/"/);
});

test("the FAQPage and SoftwareApplication JSON-LD on index matches visible copy exactly", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on index");
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  const app = parsed.find((p) => p["@type"] === "SoftwareApplication");
  assert.ok(app, "missing SoftwareApplication JSON-LD on index");
  assert.equal(app.offers.price, "0");
});

test("no module in this venture can reach the network", () => {
  const calcSource = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  const html = page("index.html");
  assert.doesNotMatch(calcSource, /\bfetch\(/);
  assert.doesNotMatch(calcSource, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
});

test("links the freelance editor quote calculator, its sibling for editing jobs", () => {
  assert.match(page("index.html"), /href="\.\.\/freelance-editor-quote-calculator\/"/);
});
