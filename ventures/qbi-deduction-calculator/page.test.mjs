import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /qbi-deduction-calculator\/<\/loc>/);
  assert.match(sitemap, /vs-doing-the-worksheet-by-hand\.html/);
  assert.match(sitemap, /why-is-my-qbi-deduction-0\.html/);
});

test("the page reads every field computeQbiDeduction accepts", () => {
  const html = page("index.html");
  for (const id of [
    "tax-year", "filing-status", "marginal-rate", "taxable-income", "net-capital-gain",
    "qbi", "is-sstb", "w2-wages", "ubia", "reit-ptp", "optout",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ computeQbiDeduction, money \} from "\.\/calc\.mjs"/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  const ids = [
    "tax-year", "filing-status", "marginal-rate", "taxable-income", "net-capital-gain",
    "qbi", "w2-wages", "ubia", "reit-ptp",
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}"`), `missing <label for="${id}">`);
  }
  assert.match(html, /<label for="is-sstb">/);
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

test("the worked example in the load-example button matches a real phase-in scenario", () => {
  const html = page("index.html");
  assert.match(html, /els\.taxableIncome\.value = "230000"/);
  assert.match(html, /els\.qbi\.value = "150000"/);
});

test("clicking calculate records deduction_calculated, not a different event name", () => {
  const html = page("index.html");
  assert.match(html, /record\("deduction_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("index links the quarterly-estimated-tax-calendar sibling and the by-hand comparison page", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/quarterly-estimated-tax-calendar\/"/);
  assert.match(html, /href="\.\/vs-doing-the-worksheet-by-hand\.html"/);
});

// Sibling-orphan budget (platform/pages/siblings.mjs --check,
// siblings-budget.json): closed in the same commit that graduated this
// venture rather than left as an orphan for a later session. Reciprocal
// half lives in ventures/1099k-reconciliation-worksheet/page.test.mjs --
// both serve a self-employed filer, just at opposite ends of the same tax
// year's numbers.
test("index links one hop to the 1099k-reconciliation-worksheet sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/1099k-reconciliation-worksheet\/"/,
    'index must link ../1099k-reconciliation-worksheet/ so crawlers reach it in one hop',
  );
});

test("the comparison page names no specific tax-prep company or competing calculator", () => {
  const html = page("vs-doing-the-worksheet-by-hand.html");
  assert.doesNotMatch(html, /TurboTax|H&R Block|TaxAct|Keeper|FreeTaxUSA/i);
  assert.match(html, /No warranty/);
});

test("index links one hop to the s-corp-reasonable-compensation-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/s-corp-reasonable-compensation-calculator\/"/,
    'index must link ../s-corp-reasonable-compensation-calculator/ so crawlers reach it in one hop',
  );
});

test("index links the why-is-my-qbi-deduction-0 guide", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\/why-is-my-qbi-deduction-0\.html"/);
});

test("the why-is-my-qbi-deduction-0 guide carries the disclaimer, a link back, and matching FAQ schema", () => {
  const html = page("why-is-my-qbi-deduction-0.html");
  assert.match(html, /No warranty/);
  assert.match(html, /href="\.\/"/);
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
