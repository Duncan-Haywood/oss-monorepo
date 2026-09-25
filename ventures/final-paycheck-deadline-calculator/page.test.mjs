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

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["state", "separation-type", "separation-date", "next-payday", "accrued-hours", "hourly-rate"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /finalPaycheckDeadline/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["state", "separation-type", "separation-date", "next-payday", "accrued-hours", "hourly-rate", "ca-notice", "mn-demand", "mn-demand-date"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page names all eleven modeled states plus the general default", () => {
  const html = page("index.html");
  for (const state of ["California", "Colorado", "Massachusetts", "Montana", "Illinois", "Minnesota", "Arizona", "Texas", "New York", "Washington", "Nevada"]) {
    assert.match(html, new RegExp(state), `missing state ${state}`);
  }
  assert.match(html, /general next-payday default/);
});

test("the page explicitly states California's 72-hour notice carve-out and Minnesota's 24-hour demand rule", () => {
  const html = page("index.html");
  assert.match(html, /72[\s\S]{0,20}hours['’]? notice/i);
  assert.match(html, /24-hour clock/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("deadline_calculated"\)/);
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
  const { finalPaycheckDeadline, formatDate } = await import("./calc.mjs");
  const result = finalPaycheckDeadline({
    state: "CA", separationType: "voluntary", noticeGiven: false,
    separationDate: "2026-10-01", accruedPtoHours: 40, hourlyRate: 28,
  });
  assert.equal(formatDate(result.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 4))));
  assert.equal(result.ptoPayoutAmount, 1120);
  assert.match(html, /els\.state\.value = "CA"/);
  assert.match(html, /els\.separationType\.value = "voluntary"/);
  assert.match(html, /els\.separationDate\.value = "2026-10-01"/);
});
