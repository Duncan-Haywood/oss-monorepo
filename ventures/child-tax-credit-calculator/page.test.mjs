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

test("index page names the key dollar figures and rates", () => {
  const html = page("index.html");
  assert.ok((html.match(/\$2,200/g) || []).length >= 3, "expected '$2,200' to appear more than once");
  assert.match(html, /\$500/);
  assert.match(html, /\$1,700/);
  assert.match(html, /\$200,000/);
  assert.match(html, /\$400,000/);
  assert.match(html, /\$2,500/);
  assert.match(html, /15%/);
  assert.match(html, /\$50/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["filing-status", "magi", "earned-income", "filer-has-ssn", "qualifying-children", "other-dependents"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /computeChildTaxCredit/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["filing-status", "magi", "earned-income", "qualifying-children", "other-dependents"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
  assert.match(html, /<label for="filer-has-ssn">/);
});

test("the page explicitly states the filer SSN requirement", () => {
  const html = page("index.html");
  assert.match(html, /Social Security number/i);
  assert.match(html, /at least one spouse/i);
});

test("the page states the refundable ceiling is a maximum, not a guaranteed refund", () => {
  const html = page("index.html");
  assert.match(html, /not a guaranteed refund/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// Cross-links its closest topical sibling (another child/family-focused
// federal OBBBA provision) so platform/pages/siblings.mjs --check does not
// flag it as a crawlable orphan on its first commit.
// trump-account-calculator/index.html pins the reciprocal link back.
test("index links one hop to the trump-account-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/trump-account-calculator\/"/,
    'index must link ../trump-account-calculator/ so crawlers reach the sibling in one hop',
  );
});

test("index links to the vs-doing-the-math-by-hand comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-doing-the-math-by-hand\.html"/);
});

test("the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const vsPage = page("vs-doing-the-math-by-hand.html");
  assert.match(vsPage, /href="\.\/"/);
  const blocks = [...vsPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(vsPage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(vsPage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the comparison page carries the no-warranty clause and is listed in the venture sitemap", () => {
  const vsPage = page("vs-doing-the-math-by-hand.html");
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /vs-doing-the-math-by-hand\.html/);
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
  const vsPage = page("vs-doing-the-math-by-hand.html");
  assert.doesNotMatch(calcSource, /\bfetch\(/);
  assert.doesNotMatch(calcSource, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
  assert.doesNotMatch(vsPage, /\bfetch\(/);
});

// Pins the worked example the "Load an example" button uses against
// calc.mjs directly, so the page's example narration cannot silently
// drift from what the engine actually computes.
test("the worked example matches calc.mjs's own output", async () => {
  const { computeChildTaxCredit } = await import("./calc.mjs");
  const result = computeChildTaxCredit({
    filingStatus: "joint",
    magi: 420000,
    earnedIncome: 180000,
    qualifyingChildren: 2,
    otherDependents: 1,
    filerHasSsn: true,
  });
  assert.equal(result.totalAfter, 3900);
  assert.equal(result.maxRefundable, 3400);
  const html = page("index.html");
  assert.match(html, /els\.magi\.value = "420000"/);
  assert.match(html, /els\.qualifyingChildren\.value = "2"/);
});
