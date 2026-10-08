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
  assert.match(html, /\$72,000/);
  assert.match(html, /20%/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["net-profit", "planned"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /sepIraContributionOutcome/);
});

test("every input carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["net-profit", "planned"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page states the employee-equal-percentage rule and the sole-proprietor scope", () => {
  const html = page("index.html");
  assert.match(html, /same percentage/i);
  assert.match(html, /sole proprietor.*single-member LLC/i);
});

test("the page links to the Solo 401(k) sibling", () => {
  assert.match(page("index.html"), /\.\.\/solo-401k-contribution-calculator\//);
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
  const { sepIraContributionOutcome } = await import("./calc.mjs");
  const result = sepIraContributionOutcome({ netProfit: 150_000 });
  assert.ok(Math.abs(result.earnings - 139_402.84) < 0.01);
  assert.ok(Math.abs(result.maxContribution - 27_880.57) < 0.01);
  assert.ok(Math.abs(result.solo401kMax - 52_380.57) < 0.01);
  assert.match(html, /els\.netProfit\.value = "150000"/);
  assert.match(html, /\$27,880\.57/);
  assert.match(html, /\$52,380\.57/);
});
