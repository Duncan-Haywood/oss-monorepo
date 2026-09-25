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

test("index page names the 1-year and 2-year elections, and the $31 million eligibility figure, more than once", () => {
  const html = page("index.html");
  assert.ok((html.match(/1-year/g) || []).length >= 3, "expected the 1-year option to appear more than once");
  assert.ok((html.match(/2-year/g) || []).length >= 3, "expected the 2-year option to appear more than once");
  assert.match(html, /\$31 million/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of [
    "remaining-balance", "income-2025", "rate-2025", "income-2026", "rate-2026", "discount-rate",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /compareCatchUpPaths/);
});

test("the page explicitly warns that a deduction exceeding taxable income can create or increase an NOL", () => {
  const html = page("index.html");
  assert.match(html, /net operating loss/i);
  assert.match(html, /\bNOL\b/);
});

test("the page explicitly distinguishes the 2025-return election from the retroactive amendment path that closed", () => {
  const html = page("index.html");
  assert.match(html, /July 6, 2026/);
  assert.match(html, /retroactive/i);
});

test("the page states the present-value / time-value-of-money comparison is included", () => {
  const html = page("index.html");
  assert.match(html, /present value/i);
  assert.match(html, /discount rate/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture links to its closest sibling (both are brand-new, deterministic
// 2025-2026 OBBBA calculators with the same "no signup, run the numbers
// yourself" shape), and needs at least one INBOUND link from an existing
// venture so platform/pages/siblings.mjs --check does not flag it as a
// crawlable orphan on its first commit (its own committed budget is 0).
// trump-account-calculator/page.test.mjs pins the reciprocal link back.
test("index links one hop to the trump-account-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/trump-account-calculator\/"/,
    'index must link ../trump-account-calculator/ so crawlers reach the sibling in one hop',
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
