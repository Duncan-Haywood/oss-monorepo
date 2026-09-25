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

test("index page names the SALT cap, phase-out, and the 2025/2026 dollar figures", () => {
  const html = page("index.html");
  assert.ok((html.match(/SALT/g) || []).length >= 3, "expected 'SALT' to appear more than once");
  assert.ok((html.match(/phase-out/gi) || []).length >= 3, "expected 'phase-out' to appear more than once");
  assert.match(html, /\$40,000/);
  assert.match(html, /\$500,000/);
  assert.match(html, /\$40,400/);
  assert.match(html, /\$505,000/);
  assert.match(html, /\$10,000/);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["filing-status", "tax-year", "magi", "salt-paid"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /saltCapOutcome/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  for (const id of ["filing-status", "tax-year", "magi", "salt-paid"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
  }
});

test("the page explicitly states the floor never reaches zero", () => {
  const html = page("index.html");
  assert.match(html, /never drop below/i);
  assert.match(html, /\bfloor\b/i);
});

test("the page distinguishes married filing separately from the shared single/HOH/MFJ figures", () => {
  const html = page("index.html");
  assert.match(html, /married filing separately/i);
  assert.match(html, /same.*cap/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// Cross-links its closest topical sibling (also a new-in-2025 OBBBA
// deduction with an income-based MAGI phase-out) so
// platform/pages/siblings.mjs --check does not flag it as a crawlable
// orphan on its first commit. senior-deduction-calculator/index.html pins
// the reciprocal link back.
test("index links one hop to the senior-deduction-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/senior-deduction-calculator\/"/,
    'index must link ../senior-deduction-calculator/ so crawlers reach the sibling in one hop',
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

test("index links to the is-the-salt-deduction-worth-itemizing-for guide page", () => {
  assert.match(page("index.html"), /href="\.\/is-the-salt-deduction-worth-itemizing-for\.html"/);
});

test("the itemize-vs-standard guide page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const guidePage = page("is-the-salt-deduction-worth-itemizing-for.html");
  assert.match(guidePage, /href="\.\/"/);
  const blocks = [...guidePage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the guide page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(guidePage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(guidePage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the itemize-vs-standard guide page carries the no-warranty clause and is listed in the venture sitemap", () => {
  const guidePage = page("is-the-salt-deduction-worth-itemizing-for.html");
  assert.match(guidePage, /No warranty/);
  assert.match(guidePage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /is-the-salt-deduction-worth-itemizing-for\.html/);
});

test("the itemize-vs-standard guide page's three worked examples are pinned against calc.mjs's own arithmetic", async () => {
  const guidePage = page("is-the-salt-deduction-worth-itemizing-for.html");
  const { saltCapOutcome, itemizeVsStandardBenefit } = await import("./calc.mjs");

  const fully = saltCapOutcome({ filingStatus: "mfj", magi: 200_000, stateLocalTaxesPaid: 12_000, taxYear: 2025 });
  const fullyBenefit = itemizeVsStandardBenefit({
    filingStatus: "mfj",
    taxYear: 2025,
    saltDeduction: fully.deduction,
    otherItemizedDeductions: 35_000,
  });
  assert.equal(fullyBenefit.marginalBenefit, 12_000);
  assert.match(guidePage, /\$12,000 -- every dollar/);

  const partly = saltCapOutcome({ filingStatus: "mfj", magi: 200_000, stateLocalTaxesPaid: 12_000, taxYear: 2025 });
  const partlyBenefit = itemizeVsStandardBenefit({
    filingStatus: "mfj",
    taxYear: 2025,
    saltDeduction: partly.deduction,
    otherItemizedDeductions: 20_000,
  });
  assert.equal(partlyBenefit.marginalBenefit, 500);
  assert.match(guidePage, /\$500 -- not \$12,000/);

  const absorbed = saltCapOutcome({ filingStatus: "single", magi: 100_000, stateLocalTaxesPaid: 8_000, taxYear: 2025 });
  const absorbedBenefit = itemizeVsStandardBenefit({
    filingStatus: "single",
    taxYear: 2025,
    saltDeduction: absorbed.deduction,
    otherItemizedDeductions: 3_000,
  });
  assert.equal(absorbedBenefit.marginalBenefit, 0);
  assert.equal(absorbedBenefit.whollyAbsorbed, true);
  assert.match(guidePage, /<strong>\$0<\/strong>/);
});
