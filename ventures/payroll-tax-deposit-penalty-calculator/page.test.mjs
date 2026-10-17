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

test("index page states this is not tax or legal advice", () => {
  assert.match(page("index.html"), /Not tax or legal advice/);
  assert.match(page("index.html"), /not legal, tax, or financial advice/);
});

test("the page says what it leaves out: interest, the 15% tier and state deposits", () => {
  const html = page("index.html");
  assert.match(html, /No interest/);
  assert.match(html, /No 15% tier/);
  assert.match(html, /Federal deposits only/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every fixed input carries a visible <label>", () => {
  const html = page("index.html");
  for (const id of ["lookback", "newemp", "asof", "liabilities", "deposits"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the usage events are counted separately", () => {
  const html = page("index.html");
  assert.match(html, /record\("deposits_calculated"\)/);
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
  const { analyse } = await import("./calc.mjs");
  const r = analyse({ lookbackTotal: "30000", asOf: "2026-03-20", liabilities: "2026-01-09, 10000\n2026-02-06, 12000", deposits: "2026-03-02, 10000" });
  assert.equal(r.default.penaltyCents, 104000);
  assert.equal(r.optimal.penaltyCents, 74000);
  assert.match(html, /2026-01-09, 10000\\n2026-02-06, 12000/);
  assert.match(html, /\$\("#deposits"\)\.value = "2026-03-02, 10000"/);
});

test("the linked sibling ventures exist", () => {
  for (const slug of ["estimated-tax-penalty-calculator", "employee-cost-calculator"]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${slug}/index.html`, import.meta.url)), slug);
  }
});

test("the footer links the workers' comp calculator, which links back", () => {
  assert.match(page("index.html"), /href="\.\.\/workers-comp-premium-calculator\/"/);
  assert.match(readFileSync(new URL("../workers-comp-premium-calculator/index.html", import.meta.url), "utf8"), /href="\.\.\/payroll-tax-deposit-penalty-calculator\/"/);
});
