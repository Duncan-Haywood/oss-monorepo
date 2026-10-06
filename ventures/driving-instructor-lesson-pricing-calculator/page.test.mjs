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

test("the calculator has every input priceLessons reads", () => {
  const html = page("index.html");
  for (const id of [
    "lesson-price", "lesson-minutes", "gap-minutes", "slots-per-week", "weeks-per-year", "cancel-rate",
    "miles-per-lesson", "mpg", "fuel-price", "wear-per-mile", "fixed-costs", "weekly-fees",
    "target-profit", "block-lessons", "block-price",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /priceLessons/);
});

test("the report shows break-even and target prices", () => {
  const html = page("index.html");
  assert.match(html, /Break-even lesson price/);
  assert.match(html, /Price that reaches your profit target/);
});

test("the comparison offers a copy, with a clipboard fallback", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-summary"/);
  assert.match(html, /Copy summary/);
  assert.match(html, /formatPricingSummary/);
  assert.match(html, /id="copy-fallback"[^>]*hidden/);
  assert.match(html, /<label class="note" for="copy-text">/);
  assert.match(html, /<textarea id="copy-text"[^>]*readonly/);
  assert.match(html, /catch \{/);
});

// A copy taken after Clear, or after editing an input without recalculating,
// must not hand out figures the screen is no longer showing.
test("the summary is served from the last calculated result, and Clear drops it", () => {
  const html = page("index.html");
  assert.match(html, /let lastResult = null;/);
  assert.match(html, /lastResult = result;/);
  assert.match(html, /if \(!lastResult\)/);
  const clearBlock = html.slice(html.indexOf('$("#clear")'));
  assert.match(clearBlock.slice(0, 700), /lastResult = null;/);
});

test("comparing and copying are counted as separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("pricing_calculated"\)/);
  assert.match(html, /record\("summary_copied"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture graduated with nothing linking to it, so without an explicit
// one-hop a crawler landing here could not reach any sibling at all
// (platform/pages/siblings.mjs --check orphan class).
test("index links one hop to the music-lesson-break-even sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/music-lesson-break-even\/"/,
    'index must link ../music-lesson-break-even/ so crawlers reach the music lesson calculator in one hop',
  );
  assert.match(html, /music lesson break-even calculator/i);
});

test("the cancellation rate input is bounded below 100", () => {
  const html = page("index.html");
  const inputTag = html.match(/<input[^>]*id="cancel-rate"[^>]*>/)[0];
  assert.match(inputTag, /min="0"/);
  assert.match(inputTag, /max="99"/);
});

test("page links the tutor hourly rate calculator", () => {
  assert.match(page("index.html"), /href="\.\.\/tutor-effective-hourly-rate-calculator\/"/);
});

test("page links the private pilot training cost calculator", () => {
  assert.match(page("index.html"), /href="\.\.\/private-pilot-training-cost-calculator\/"/);
});
