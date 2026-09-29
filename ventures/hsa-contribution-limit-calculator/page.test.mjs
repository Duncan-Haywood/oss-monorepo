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

test("index page names the 2026 dollar figures", () => {
  const html = page("index.html");
  assert.match(html, /\$4,400/);
  assert.match(html, /\$8,750/);
  assert.match(html, /\$1,000/);
  assert.match(html, /\$1,700/);
  assert.match(html, /\$3,400/);
  assert.match(html, /\$8,500/);
  assert.match(html, /\$17,000/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["coverage", "months", "age55", "last-month-rule", "deductible", "oop-max"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /contributionLimitOutcome/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["coverage", "months", "age55", "last-month-rule", "deductible", "oop-max"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page explicitly explains the last-month rule's testing period", () => {
  const html = page("index.html");
  assert.match(html, /testing period/i);
  assert.match(html, /last-month rule/i);
});

test("the page states the catch-up is fixed by statute", () => {
  const html = page("index.html");
  assert.match(html, /fixed by statute/i);
});

test("the calculation is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("limit_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
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

test("the worked example in the page script matches calc.mjs's own arithmetic", async () => {
  const html = page("index.html");
  const { contributionLimitOutcome } = await import("./calc.mjs");
  const result = contributionLimitOutcome({
    coverage: "family",
    eligibleMonths: 6,
    age55Plus: true,
    useLastMonthRule: false,
  });
  assert.equal(result.baseLimit, 4_375);
  assert.equal(result.catchUpLimit, 500);
  assert.equal(result.totalLimit, 4_875);
  assert.match(html, /els\.coverage\.value = "family"/);
  assert.match(html, /els\.months\.value = "6"/);
  assert.match(html, /\$4,875/);
});

test("page links to the medical bill error checker, which links back", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/medical-bill-error-checker\/"/);
  const theirs = readFileSync(new URL("../medical-bill-error-checker/index.html", import.meta.url), "utf8");
  assert.match(theirs, /href="\.\.\/hsa-contribution-limit-calculator\/"/);
});

test("page links to the ACA subsidy cliff calculator, which links back", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/aca-subsidy-cliff-calculator\/"/);
});
