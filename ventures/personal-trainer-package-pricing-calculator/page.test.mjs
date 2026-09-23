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
  assert.match(html, /not tax, legal, or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("the calculator has every input comparePricing reads", () => {
  const html = page("index.html");
  for (const id of [
    "rate-per-session", "package-sessions", "package-price", "no-show-rate",
    "makeup-owed", "session-minutes", "venue-model", "venue-percent",
    "venue-flat-fee", "target-hourly",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /comparePricing/);
});

test("the venue model select offers all three cost structures", () => {
  const html = page("index.html");
  assert.match(html, /<option value="none">/);
  assert.match(html, /<option value="percent">/);
  assert.match(html, /<option value="flat">/);
});

test("the report table shows both pricing models", () => {
  const html = page("index.html");
  assert.match(html, /Pay-per-session/);
  assert.match(html, /Package<\/td>/);
});

test("the comparison offers a copy, with a clipboard fallback", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-summary"/);
  assert.match(html, /Copy comparison/);
  assert.match(html, /formatComparisonSummary/);
  assert.match(html, /id="copy-fallback"[^>]*hidden/);
  assert.match(html, /<label class="note" for="copy-text">/);
  assert.match(html, /<textarea id="copy-text"[^>]*readonly/);
  assert.match(html, /catch \{/);
});

// A copy taken after Clear, or after editing an input without recalculating,
// must not hand out figures the screen is no longer showing.
test("the comparison is served from the last calculated result, and Clear drops it", () => {
  const html = page("index.html");
  assert.match(html, /let lastResult = null;/);
  assert.match(html, /lastResult = result;/);
  assert.match(html, /if \(!lastResult\)/);
  const clearBlock = html.slice(html.indexOf('$("#clear")'));
  assert.match(clearBlock.slice(0, 900), /lastResult = null;/);
});

test("comparing and copying are counted as separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("comparison_calculated"\)/);
  assert.match(html, /record\("summary_copied"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture graduated with nothing linking to it, so without an explicit
// one-hop a crawler landing here could not reach any sibling at all
// (platform/pages/siblings.mjs --check orphan class).
test("index links one hop to the tutor-package-pricing-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/tutor-package-pricing-calculator\/"/,
    'index must link ../tutor-package-pricing-calculator/ so crawlers reach the tutor calculator in one hop',
  );
  assert.match(html, /tutor package pricing calculator/i);
});

test("the no-show rate input is bounded to 0-100", () => {
  const html = page("index.html");
  const inputTag = html.match(/<input[^>]*id="no-show-rate"[^>]*>/)[0];
  assert.match(inputTag, /min="0"/);
  assert.match(inputTag, /max="100"/);
});

test("the venue percentage input is bounded below 100", () => {
  const html = page("index.html");
  const inputTag = html.match(/<input[^>]*id="venue-percent"[^>]*>/)[0];
  assert.match(inputTag, /min="0"/);
  assert.match(inputTag, /max="99"/);
});
