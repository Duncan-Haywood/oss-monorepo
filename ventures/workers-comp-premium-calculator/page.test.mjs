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

test("index page states this is not insurance, legal, tax, or financial advice", () => {
  assert.match(page("index.html"), /Not insurance, legal, tax, or financial advice/);
  assert.match(page("index.html"), /not legal, tax, or financial advice/);
});

test("the page says it ships no rates and the user supplies them", () => {
  assert.match(page("index.html"), /No rate or class-code lookup/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every fixed input carries a visible <label>", () => {
  const html = page("index.html");
  for (const id of ["mod", "schedule", "discount", "surcharge", "expense", "flat", "otmult", "rc-payroll", "rc-from", "rc-to"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
  assert.match(html, /aria-label="Estimated payroll"/);
});

test("the usage events are counted separately", () => {
  const html = page("index.html");
  assert.match(html, /record\("premium_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("the FAQPage and SoftwareApplication JSON-LD matches visible copy exactly", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("no module in this venture can reach the network", () => {
  for (const src of [page("calc.mjs"), page("index.html")]) {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the worked example in the page matches calc.mjs's own arithmetic", async () => {
  const html = page("index.html");
  const { policyPremium, auditTrueUp } = await import("./calc.mjs");
  const inp = { classes: [{ label: "Roofing", payroll: 200000, rate: 18.5, overtimeWages: 20000 }, { label: "Clerical", payroll: 40000, rate: 0.35 }], mod: 1.12, schedulePct: 5, expenseConstant: 250 };
  assert.equal(policyPremium(inp).total, 42476.24);
  const a = auditTrueUp(inp, [{ label: "Roofing", payroll: 260000, rate: 18.5, overtimeWages: 20000 }, { label: "Clerical", payroll: 40000, rate: 0.35 }]);
  assert.ok(a.diff > 0 && a.direction === "additional");
  assert.match(html, /payroll: 200000, rate: 18\.5, ot: 20000, actual: 260000/);
  assert.match(html, /\$("#mod")|#mod"\)\.value = "1\.12"/);
});

test("the linked sibling ventures exist", () => {
  for (const slug of ["employee-cost-calculator", "staffing-markup-calculator"]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${slug}/index.html`, import.meta.url)), slug);
  }
});

test("the footer links the payroll tax deposit penalty calculator", () => {
  assert.match(page("index.html"), /href="\.\.\/payroll-tax-deposit-penalty-calculator\/"/);
});
