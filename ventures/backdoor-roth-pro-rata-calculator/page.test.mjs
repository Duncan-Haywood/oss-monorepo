import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not legal, tax, or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["conversion", "contribution", "prior-basis", "year-end-value", "other-distributions", "rate", "age"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("the page tells filers to count every custodian's IRAs", () => {
  assert.match(page("index.html"), /across every custodian/);
});

test("calculation and example are separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("conversion_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("FAQPage and SoftwareApplication JSON-LD match visible copy", () => {
  const html = page("index.html");
  const parsed = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  const app = parsed.find((p) => p["@type"] === "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("no module can reach the network", () => {
  const calc = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  const html = page("index.html");
  for (const src of [calc, html]) {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the worked example in the page script matches calc.mjs", async () => {
  const html = page("index.html");
  const { backdoorRothOutcome } = await import("./calc.mjs");
  const r = backdoorRothOutcome({ conversion: 7_500, nondeductibleContribution: 7_500, yearEndIraValue: 92_500, marginalRate: 24, age: 40 });
  assert.equal(r.taxableConversion, 6_937.5);
  assert.equal(r.estimatedTax, 1_665);
  assert.match(html, /els\.conversion\.value = "7500"/);
  assert.match(html, /els\.yearEnd\.value = "92500"/);
  assert.match(html, /\$6,937\.50/);
  assert.match(html, /\$1,665\.00/);
});
