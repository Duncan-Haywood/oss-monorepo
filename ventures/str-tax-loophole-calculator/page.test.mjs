import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const INPUTS = ["rental-days", "stays", "personal-days", "services", "my-hours", "spouse-hours", "others-hours", "top-other-hours", "active", "price", "land-pct", "month", "recovery", "reclass-pct", "furniture", "study-cost", "noi", "filing", "magi", "fed-rate", "state-rate", "other-passive", "other-business", "at-risk"];

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

test("index page states the verified 2026 figures", () => {
  const html = page("index.html");
  assert.match(html, /7 days or less/);
  assert.match(html, /\$25,000/);
  assert.match(html, /\$100,000 and \$150,000/);
  assert.match(html, /\$256,000/);
  assert.match(html, /\$512,000/);
  assert.match(html, /January 19, 2025/);
});

test("every input is present and has a visible label", () => {
  const html = page("index.html");
  for (const id of INPUTS) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for #${id}`);
  }
  assert.match(html, /strTaxOutcome/);
});

test("calculation and example loads are separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("loophole_checked"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("sibling links point at the related tax calculators", () => {
  const html = page("index.html");
  for (const slug of ["excess-business-loss-calculator", "depreciation-recapture-calculator", "bonus-depreciation-calculator"]) {
    assert.match(html, new RegExp(`\\.\\./${slug}/`));
  }
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

test("no module in this venture can reach the network or take payment", () => {
  for (const f of ["calc.mjs", "usage.mjs", "index.html"]) {
    const src = page(f);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /XMLHttpRequest/);
    assert.doesNotMatch(src, /stripe|paypal|checkout/i);
  }
});

test("the worked example in the page matches calc.mjs's arithmetic", async () => {
  const { strTaxOutcome } = await import("./calc.mjs");
  const r = strTaxOutcome({
    rentalDays: 210, stays: 60, personalDays: 10, myHours: 250, othersTotalHours: 300, topOtherHours: 200,
    filingStatus: "single", magi: 180000, purchasePrice: 600000, landPct: 20, monthPlaced: 3, recoveryYears: 27.5,
    reclassPct: 25, furniture: 20000, studyCost: 6000, noiBeforeDepreciation: 30000, fedRatePct: 32, stateRatePct: 0, activeParticipation: true,
  });
  assert.equal(r.path, "nonpassive");
  assert.ok(Math.abs(r.base.dep.total - 33818.18) < 0.005);
  assert.ok(Math.abs(r.seg.dep.total - 150363.64) < 0.005);
  assert.ok(Math.abs(r.actual.seg.savings - 38516.36) < 0.005);
  const html = page("index.html");
  assert.match(html, /\$33,818\.18/);
  assert.match(html, /\$150,363\.64/);
  assert.match(html, /\$38,516\.36/);
});
