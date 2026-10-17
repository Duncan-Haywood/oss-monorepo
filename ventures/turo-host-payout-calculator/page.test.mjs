import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, trademark disclaimer, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /not\s+affiliated\s+with/i);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every input has an associated label", () => {
  const html = page("index.html");
  const inputTags = [...html.matchAll(/<(?:input|select)\b[^>]*>/g)].map((m) => m[0]);
  const inputIds = inputTags
    .map((tag) => tag.match(/\bid="([^"]+)"/))
    .filter(Boolean)
    .map((m) => m[1]);
  assert.ok(inputIds.length > 5, "expected several labeled fields on the page");
  for (const id of inputIds) {
    const hasForLabel = new RegExp(`<label[^>]*for="${id}"`).test(html);
    const wrappingLabel = new RegExp(`<label[^>]*>(?:(?!</label>)[\\s\\S])*id="${id}"(?:(?!</label>)[\\s\\S])*</label>`).test(html);
    assert.ok(hasForLabel || wrappingLabel, `#${id} must have an associated label (for= or wrapping <label>)`);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

// Closest sibling by shape: both compare a peer-to-peer asset-sharing
// platform's host payout across host-decision levers (plan/channel choice,
// timing) for one independent host. Without a crawlable link here, a
// crawler entering on this calculator can never reach the STR calculator in
// one hop (platform/pages/siblings.test.mjs's orphan budget).
test("index links one hop to the str-host-payout-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/str-host-payout-calculator\/"/,
    "index must link ../str-host-payout-calculator/ so crawlers reach it in one hop",
  );
  assert.match(html, /short-term rental host payout calculator/i);
});

test("the plan and booking-window <select> elements carry all documented options", () => {
  const html = page("index.html");
  for (const value of ["peace_of_mind", "balanced", "more_earnings"]) {
    assert.match(html, new RegExp(`<option value="${value}"`));
  }
  for (const value of ["0_2", "3_13", "14_27", "28_plus"]) {
    assert.match(html, new RegExp(`<option value="${value}"`));
  }
});

// Closes an orphan pair: a crawler entering here reaches rv-rental-host-profit-calculator in one hop.
test("index links one hop to rv-rental-host-profit-calculator", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\.\/rv-rental-host-profit-calculator\/"/);
});
