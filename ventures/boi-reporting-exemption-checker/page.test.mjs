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

test("index page names the rule's effective date and both foreign-reporting-company deadlines", () => {
  const html = page("index.html");
  assert.match(html, /August 11, 2026/);
  assert.match(html, /August 14, 2026/);
  assert.match(html, /April 25, 2025/);
  assert.match(html, /March 26, 2025/);
  assert.match(html, /30 calendar days/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["formed", "registered", "reg-date", "owners"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /boiExemptionOutcome/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["formed", "registered", "reg-date", "owners"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page explicitly states the permanent exemption for US-formed entities", () => {
  const html = page("index.html");
  assert.match(html, /permanently/i);
  assert.match(html, /formed in the United States/i);
});

test("the page explicitly states only non-US-person owners get reported", () => {
  const html = page("index.html");
  assert.match(html, /not a U\.S\. person/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("exemption_checked"\)/);
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
  const { boiExemptionOutcome } = await import("./calc.mjs");
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "2026-01-15",
    allOwnersUSPersons: false,
  });
  assert.equal(result.mustFile, true);
  assert.equal(result.deadline, "2026-02-14");
  assert.equal(result.mustReportAnyOwner, true);
  assert.match(html, /els\.regDate\.value = "2026-01-15"/);
  assert.match(html, /els\.owners\.value = "no"/);
  assert.match(html, /2026-02-14/);
});
