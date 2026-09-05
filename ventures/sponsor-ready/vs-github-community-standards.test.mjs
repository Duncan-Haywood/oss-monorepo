import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-github-community-standards.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = fs.readFileSync(new URL("./robots.txt", import.meta.url), "utf8");
const scoring = await import("./scoring.js");

const CHECKS = scoring.CHECKS ?? Object.values(scoring).find((v) => Array.isArray(v));
const weightOf = (id) => CHECKS.find((c) => c.id === id)?.weight;

// Signals GitHub's Community Standards page does not look at. The page's
// headline claim is the sum of these, so it is derived here rather than
// restated -- reweighting scoring.js must fail this test instead of quietly
// making the published page wrong.
const NOT_IN_COMMUNITY_STANDARDS = [
  "funding_config",
  "recent_activity",
  "funding_mentioned",
  "topics_set",
  "homepage_or_demo",
];

test("carries the no-warranty disclaimer and the not-a-forecast caveat", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /<strong>A score is not a forecast\.<\/strong>/);
  assert.match(html, /scoring 100 does not mean anyone will sponsor you/);
});

test("carries the licence and optional-support line", () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Refusing does not change the checklist/);
  assert.match(html, /LICENSE/);
});

test("states it is not affiliated with GitHub", () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by GitHub or Microsoft/);
});

test("no unverifiable price is claimed", () => {
  // GitHub's own pricing is not reachable from this session, and this tool
  // promises no dollar outcome either. Same discipline as vs-avalara.html.
  assert.doesNotMatch(html, /\$\d/);
});

test("the canonical tag resolves to this page's own served URL", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-github-community-standards\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="vs-github-community-standards\.html"/);
});

test("the comparison page is listed in the sitemap and allowed by robots", () => {
  assert.match(sitemap, /vs-github-community-standards\.html/);
  assert.match(robots, /Allow: \//);
});

test("links back to the checklist and to the signal writeup", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="github-sponsors-readiness-checklist\.html"/);
});

// The whole argument of the page is a number: how much of the score lives in
// signals the free built-in alternative cannot see. An earlier draft said
// "four things ... 60 points" and omitted homepage_or_demo, which is also
// absent from Community Standards -- the real figures are five and 64. Derive
// both from scoring.js so the page cannot drift from the tool it describes.
test("the headline weight claim is the one scoring.js actually produces", () => {
  const total = CHECKS.reduce((sum, c) => sum + c.weight, 0);
  assert.equal(total, 100, "the score no longer totals 100, so the page's fractions are wrong");

  const uncovered = NOT_IN_COMMUNITY_STANDARDS.reduce((sum, id) => {
    const w = weightOf(id);
    assert.ok(w !== undefined, `scoring.js no longer has a check called ${id}`);
    return sum + w;
  }, 0);

  assert.equal(uncovered, 64);
  assert.equal(NOT_IN_COMMUNITY_STANDARDS.length, 5);
  assert.match(html, /five signals Community Standards does not look at are\s*\n?\s*<strong>64 of the 100 points<\/strong>/);
  assert.match(html, /Five things, and together they are 64 of the 100 points/);
  assert.match(html, /The remaining 36 points/);
  assert.equal(total - uncovered, 36);
});

test("every weight printed in the comparison table matches scoring.js", () => {
  for (const check of CHECKS) {
    assert.ok(
      new RegExp(`<td class="w">${check.weight}</td>`).test(html),
      `no table row carries weight ${check.weight} for ${check.id}`,
    );
  }
  // FUNDING.yml is the single largest signal and the page leans on that.
  assert.equal(weightOf("funding_config"), 30);
  assert.match(html, /worth 30 on its own/);
});

// The tool is account-free precisely because it calls the API
// unauthenticated, and that ceiling is GitHub's, not a choice. Saying the
// wrong number here would be a support burden, so it is pinned to the string
// the app itself shows the visitor.
test("the rate-limit figure matches the one the app tells the user", () => {
  const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /capped at 60\/hour per visitor IP/);
  assert.match(html, /60 an hour per visitor IP/);
});
