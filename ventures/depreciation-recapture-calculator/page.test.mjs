import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("the page reads every field analyzeSale accepts", () => {
  const html = page("index.html");
  for (const id of [
    "purchase-price", "land-value", "improvements", "depreciation-taken",
    "selling-price", "selling-costs", "mortgage-payoff", "ltcg-rate",
    "ordinary-rate-cap", "include-niit", "exchange-boot",
    "copy-link", "optout",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ analyzeSale, DEFAULTS \} from "\.\/calc\.mjs"/);
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from "\.\/share\.mjs"/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  const ids = [
    "purchase-price", "land-value", "improvements", "depreciation-taken",
    "selling-price", "selling-costs", "mortgage-payoff", "ltcg-rate",
    "ordinary-rate-cap", "include-niit", "exchange-boot",
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}"`), `missing <label for="${id}">`);
  }
});

test("the FAQPage JSON-LD matches the visible common-questions text verbatim", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD");
  assert.ok(faq.mainEntity.length >= 4);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(html.includes(name), `question not found verbatim: ${name}`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("the worked example in the load-example button matches calc.mjs's DEFAULTS", () => {
  const html = page("index.html");
  assert.match(html, /\$300,000 rental/);
  assert.match(html, /\$87,000 of depreciation/);
});

// Sibling-orphan budget (platform/pages/siblings.mjs, siblings-budget.json):
// reciprocal half of the link added to quarterly-estimated-tax-calendar the
// same session -- both serve a taxpayer at two different points of the same
// question, ongoing filing vs. a one-time property sale.
test("index links one hop to the quarterly-estimated-tax-calendar sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/quarterly-estimated-tax-calendar\/"/,
    'index must link ../quarterly-estimated-tax-calendar/ so crawlers reach it in one hop',
  );
});

// Reciprocal half of the link added to bonus-depreciation-calculator the same
// session -- the other end of the same depreciation lifecycle (buying new
// equipment vs. selling depreciated property), needed so the new venture's
// own inbound link is satisfied on its first commit (its committed
// sibling-orphan budget is 0).
test("index links one hop to the bonus-depreciation-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/bonus-depreciation-calculator\/"/,
    'index must link ../bonus-depreciation-calculator/ so crawlers reach it in one hop',
  );
});

test("clicking calculate records sale_analyzed, not a different event name", () => {
  const html = page("index.html");
  assert.match(html, /record\("sale_analyzed"\)/);
  assert.match(html, /record\("example_loaded"\)/);
  assert.match(html, /record\("link_copied"\)/);
});

test("index links to the vs-doing-it-by-hand comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-doing-it-by-hand\.html"/);
});

test("the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const vsPage = page("vs-doing-it-by-hand.html");
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
  const vsPage = page("vs-doing-it-by-hand.html");
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /vs-doing-it-by-hand\.html/);
});
