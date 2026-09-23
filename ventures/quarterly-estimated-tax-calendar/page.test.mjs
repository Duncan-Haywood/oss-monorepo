import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("the page reads every field computeSchedule accepts", () => {
  const html = page("index.html");
  for (const id of [
    "tax-year", "prior-year-tax", "prior-year-agi", "current-year-estimate",
    "withholding", "as-of-date", "mfs", "paid-q1", "paid-q2", "paid-q3", "paid-q4",
    "download-ics", "optout",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ computeSchedule, icsCalendar \} from "\.\/calc\.mjs"/);
});

// Closest cross-venture sibling: a gig worker figuring out their per-session
// tax reserve is exactly the audience who then needs the quarterly filing
// calendar this page provides -- the gig-driver page's own article says it
// deliberately does not model due dates. Related-tool chrome rotates by
// category, so without an explicit one-hop link a crawler landing on either
// page may never reach the other (platform/pages/siblings.mjs's orphan budget).
test("index links one hop to the gig-driver-net-pay-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/gig-driver-net-pay-calculator\/"/,
    'index must link ../gig-driver-net-pay-calculator/ so crawlers reach it in one hop',
  );
});

// Sibling-orphan budget (platform/pages/siblings.test.mjs, siblings-budget.json):
// reciprocal half of the link added to 1099k-reconciliation-worksheet the
// same session -- both serve a self-employed marketplace seller at two
// different points of the same tax year.
test("index links one hop to the 1099k-reconciliation-worksheet sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/1099k-reconciliation-worksheet\/"/,
    'index must link ../1099k-reconciliation-worksheet/ so crawlers reach it in one hop',
  );
});

// Sibling-orphan budget: reciprocal half of the link added to
// depreciation-recapture-calculator the same session -- that page sold no
// sibling any inbound link at all until this pair closed it.
test("index links one hop to the depreciation-recapture-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/depreciation-recapture-calculator\/"/,
    'index must link ../depreciation-recapture-calculator/ so crawlers reach it in one hop',
  );
});

test("index links the Keeper incumbent-comparison page and the sitemap lists it too", () => {
  const html = page("index.html");
  const sitemap = page("sitemap.xml");
  assert.match(html, /vs-keeper\.html/);
  assert.match(sitemap, /vs-keeper\.html/);
});

test("the Keeper comparison page links back, names the incumbent honestly, and cites a checkable source instead of a number only Keeper could confirm", () => {
  const vsKeeper = page("vs-keeper.html");
  assert.match(vsKeeper, /<a href="\.\/">/);
  // Names Keeper's own calculator page so a reader can check the source directly.
  assert.match(vsKeeper, /keepertax\.com\/quarterly-tax-calculator/);
  // This page has no legitimate reason to state a dollar figure for Keeper's
  // pricing or estimate -- only Keeper's own current app could confirm one.
  assert.doesNotMatch(vsKeeper, /\$\d/);
  assert.match(vsKeeper, /not affiliated with, endorsed by, or sponsored by Keeper/i);
  assert.match(vsKeeper, /No warranty/);
  assert.match(vsKeeper, /Best-effort hosting, no SLA/);
  assert.match(vsKeeper, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index links the generic-method comparison page and the sitemap lists it too", () => {
  const html = page("index.html");
  const sitemap = page("sitemap.xml");
  assert.match(html, /vs-flat-percentage-rule\.html/);
  assert.match(sitemap, /vs-flat-percentage-rule\.html/);
});

test("the flat-percentage-rule comparison page links back, names no specific company or product, and carries the standard footer", () => {
  const vsFlatRule = page("vs-flat-percentage-rule.html");
  assert.match(vsFlatRule, /<a href="\.\/">/);
  // Generic-method page: compares against a flat 25-30% set-aside habit,
  // not a company or product this could be mistaken for -- so it carries
  // no not-affiliated clause and no trademark (see clauses.mjs
  // COMPARISON_DISCLAIMER_EXEMPT), and states no dollar figure.
  const text = vsFlatRule.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, /\$\d/);
  assert.match(vsFlatRule, /No warranty/);
  assert.match(vsFlatRule, /Best-effort hosting, no SLA/);
  assert.match(vsFlatRule, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("the flat-percentage-rule page does not disparage the flat-percentage habit", () => {
  const text = page("vs-flat-percentage-rule.html").replace(/<[^>]+>/g, " ").toLowerCase();
  for (const word of ["worse", "rip-off", "ripoff", "overpriced", "scam", "useless"]) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
});

test("the flat-percentage-rule page adds no third-party script, font, stylesheet or network call", () => {
  const html = page("vs-flat-percentage-rule.html");
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

test("the flat-percentage-rule FAQPage schema matches the visible FAQ headings", () => {
  const html = page("vs-flat-percentage-rule.html");
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});
