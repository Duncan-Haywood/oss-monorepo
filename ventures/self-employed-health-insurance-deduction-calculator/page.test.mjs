import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /not legal, tax, or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index page names the verified 2026 figures", () => {
  const html = page("index.html");
  for (const f of ["\\$184,500", "\\$500", "\\$930", "\\$1,860", "\\$4,960", "\\$6,200", "92\\.35%", "12\\.4%", "2\\.9%"]) {
    assert.match(html, new RegExp(f), `missing ${f}`);
  }
});

test("every input has an id and a visible label", () => {
  const html = page("index.html");
  for (const id of ["net-profit", "retirement", "w2-wages", "health-premiums", "health-months",
    "ltc1-premium", "ltc1-age", "ltc1-months", "ltc2-premium", "ltc2-age", "ltc2-months"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
  assert.match(html, /healthInsuranceDeductionOutcome/);
});

test("scope is stated precisely and the retirement circularity is disclosed", () => {
  const html = page("index.html");
  assert.match(html, /sole proprietor or single-member LLC/i);
  assert.match(html, /more-than-2% S-corporation shareholders/);
  assert.match(html, /does not solve/i);
  assert.match(html, /employer-subsidized/);
});

test("calculation and example are separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("deduction_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("FAQPage and SoftwareApplication JSON-LD match visible copy exactly", () => {
  const html = page("index.html");
  const parsed = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD");
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  const app = parsed.find((p) => p["@type"] === "SoftwareApplication");
  assert.ok(app);
  assert.equal(app.offers.price, "0");
});

test("no module in this venture can reach the network", () => {
  const calc = page("calc.mjs");
  const html = page("index.html");
  for (const src of [calc, html]) {
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the worked example in the page script matches calc.mjs's own arithmetic", async () => {
  const html = page("index.html");
  const { healthInsuranceDeductionOutcome } = await import("./calc.mjs");
  const r = healthInsuranceDeductionOutcome({ netProfit: 80_000, healthPremiums: 9_600, ltc: [{ premium: 2_500, age: 55 }] });
  assert.ok(Math.abs(r.deduction - 11_460) < 0.01);
  assert.ok(Math.abs(r.earnedIncome - 74_348.18) < 0.01);
  assert.match(html, /\$11,460\.00/);
  assert.match(html, /\$74,348\.18/);
  assert.match(html, /"net-profit"\]\.value = "80000"/);
});

test("index links its nearest siblings one hop away", () => {
  const html = page("index.html");
  for (const s of ["solo-401k-contribution-calculator", "quarterly-estimated-tax-calendar", "qbi-deduction-calculator"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
  }
});
