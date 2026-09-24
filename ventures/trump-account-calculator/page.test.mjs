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

test("index page states the $1,000 seed deposit and the $5,000 cap more than once, not only in fine print", () => {
  const html = page("index.html");
  const seedMentions = (html.match(/\$1,000/g) || []).length;
  assert.ok(seedMentions >= 3, `expected the $1,000 seed to appear more than once, saw ${seedMentions}`);
  const capMentions = (html.match(/\$5,000/g) || []).length;
  assert.ok(capMentions >= 3, `expected the $5,000 cap to appear more than once, saw ${capMentions}`);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of [
    "current-age", "withdrawal-age", "annual-return", "seed-eligible",
    "family-contribution", "employer-contribution", "marginal-rate", "qualified-use",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /projectTrumpAccount/);
});

test("the page explicitly warns the pro-rata rule is not \"basis first\"", () => {
  assert.match(page("index.html"), /pro-rata/i);
});

test("the page explicitly warns the employer $2,500 cap counts inside the $5,000 total", () => {
  const html = page("index.html");
  assert.match(html, /INSIDE the shared \$5,000/);
});

test("the page states no distribution is allowed before age 18", () => {
  assert.match(page("index.html"), /before (the account owner turns 18|age 18)/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture links to its closest sibling in the "Back-office money &
// contracts" category (both are an IRS dollar-limit-and-headroom shape on a
// tax-advantaged account), and needs at least one INBOUND link from an
// existing venture so platform/pages/siblings.mjs --check does not flag it
// as a crawlable orphan on its first commit (its own committed budget is 0).
// mega-backdoor-roth-calculator/page.test.mjs pins the reciprocal link back.
test("index links one hop to the mega-backdoor-roth-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/mega-backdoor-roth-calculator\/"/,
    'index must link ../mega-backdoor-roth-calculator/ so crawlers reach the sibling in one hop',
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

test("the FAQPage JSON-LD on index matches visible copy exactly", () => {
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
