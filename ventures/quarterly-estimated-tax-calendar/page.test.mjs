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
