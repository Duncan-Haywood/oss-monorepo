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

test("index page states this is not legal, tax, or financial advice", () => {
  const html = page("index.html");
  assert.match(html, /not legal, tax, or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("index page names bonus depreciation, Section 179, and the 2025/2026 dollar figures", () => {
  const html = page("index.html");
  assert.ok((html.match(/bonus depreciation/gi) || []).length >= 3, "expected 'bonus depreciation' to appear more than once");
  assert.ok((html.match(/Section 179/g) || []).length >= 3, "expected 'Section 179' to appear more than once");
  assert.match(html, /\$2,500,000/);
  assert.match(html, /\$4,000,000/);
  assert.match(html, /\$2,560,000/);
  assert.match(html, /\$4,090,000/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of [
    "asset-cost", "business-use", "recovery-years", "tax-year", "other-purchases", "taxable-income", "rate",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /compareDepreciationPaths/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  const ids = ["asset-cost", "business-use", "recovery-years", "tax-year", "other-purchases", "taxable-income", "rate"];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page explicitly distinguishes the NOL and Section 179 carryforward outcomes", () => {
  const html = page("index.html");
  assert.match(html, /net operating loss/i);
  assert.match(html, /\bNOL\b/);
  assert.match(html, /carr(y|ies) forward/i);
});

test("the page flags the 50%-business-use disqualification", () => {
  const html = page("index.html");
  assert.match(html, /50%/);
  assert.match(html, /Alternative Depreciation System/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture links to its closest sibling (both are depreciation
// calculators, opposite ends of the same lifecycle: buying new equipment vs.
// selling depreciated property), needed so platform/pages/siblings.mjs
// --check does not flag it as a crawlable orphan on its first commit (its
// own committed budget is 0). depreciation-recapture-calculator/page.test.mjs
// pins the reciprocal link back.
test("index links one hop to the depreciation-recapture-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/depreciation-recapture-calculator\/"/,
    'index must link ../depreciation-recapture-calculator/ so crawlers reach the sibling in one hop',
  );
});

test("index links to the vs-doing-the-math-by-hand comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-doing-the-math-by-hand\.html"/);
});

test("the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const vsPage = page("vs-doing-the-math-by-hand.html");
  assert.match(vsPage, /href="\.\/"/);
  const blocks = [...vsPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(vsPage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(vsPage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the comparison page carries the no-warranty clause and is listed in the venture sitemap", () => {
  const vsPage = page("vs-doing-the-math-by-hand.html");
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /vs-doing-the-math-by-hand\.html/);
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
  const vsPage = page("vs-doing-the-math-by-hand.html");
  assert.doesNotMatch(calcSource, /\bfetch\(/);
  assert.doesNotMatch(calcSource, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
  assert.doesNotMatch(vsPage, /\bfetch\(/);
});
