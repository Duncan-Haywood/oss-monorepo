import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const INPUTS = ["miles-h1", "miles-h2", "total-miles", "fuel", "insurance", "repairs", "registration", "depreciation", "other-actual", "parking", "tax-rate", "se-tax", "standard-blocked"];

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index page names both 2026 IRS rates", () => {
  const html = page("index.html");
  assert.match(html, /72\.5 cents/);
  assert.match(html, /76 cents/);
  assert.match(html, /Announcement 2026-11/);
});

test("every input is present and has a visible label", () => {
  const html = page("index.html");
  for (const id of INPUTS) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for #${id}`);
  }
  assert.match(html, /mileageMethodOutcome/);
});

test("calculation and example loads are separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("deduction_compared"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("FAQPage JSON-LD matches visible copy exactly", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing: ${qa.name}`);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("no module in this venture can reach the network", () => {
  for (const f of ["calc.mjs", "usage.mjs", "index.html"]) {
    const src = page(f);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
  }
});

test("the worked example in the page matches calc.mjs's arithmetic", async () => {
  const { mileageMethodOutcome } = await import("./calc.mjs");
  const r = mileageMethodOutcome({ milesFirstHalf: 6000, milesSecondHalf: 4000, totalMiles: 12000, fuel: 3200, insurance: 1800, repairs: 900, registration: 250, depreciationOrLease: 3000, parkingTolls: 300, incomeTaxRatePct: 22 });
  assert.equal(r.standard, 7390);
  assert.ok(Math.abs(r.actual - 7625) < 0.005);
  assert.equal(r.best, "actual");
  const html = page("index.html");
  assert.match(html, /\$7,390\.00/);
  assert.match(html, /\$7,625\.00/);
  assert.match(html, /\$235\.00/);
});

test("footer points to the mileage log for the trips behind the miles", () => {
  assert.match(page("index.html"), /href="\.\.\/mileage-log\/"/);
});
