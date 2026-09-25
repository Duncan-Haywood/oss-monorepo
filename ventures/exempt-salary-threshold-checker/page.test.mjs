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

test("index page names the federal and all five state 2026 dollar figures", () => {
  const html = page("index.html");
  assert.match(html, /\$684/);
  assert.match(html, /\$1,352/);
  assert.match(html, /\$1,541\.70/);
  assert.match(html, /\$871\.16/);
  assert.match(html, /\$1,120/);
  assert.match(html, /\$1,275/);
  assert.match(html, /\$1,199\.10/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["jurisdiction", "category", "weekly-salary"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /exemptionOutcome/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["jurisdiction", "category", "weekly-salary"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page explicitly states the salary threshold is necessary, not sufficient", () => {
  const html = page("index.html");
  assert.match(html, /necessary/i);
  assert.match(html, /\bduties test\b/i);
});

test("the page explicitly states New York's professional-exemption carve-out", () => {
  const html = page("index.html");
  assert.match(html, /New York.{0,40}professional exemption/is);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("threshold_checked"\)/);
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
  const { exemptionOutcome } = await import("./calc.mjs");
  const result = exemptionOutcome({ jurisdiction: "NY_DOWNSTATE", category: "professional", weeklySalary: 900 });
  assert.equal(result.usesFederalOnly, true);
  assert.equal(result.meetsThreshold, true);
  assert.match(html, /els\.jurisdiction\.value = "NY_DOWNSTATE"/);
  assert.match(html, /els\.category\.value = "professional"/);
  assert.match(html, /els\.weeklySalary\.value = "900"/);
});
