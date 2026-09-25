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

test("index page states the phase-down and the $40,000 cap more than once, not only in fine print", () => {
  const html = page("index.html");
  const phasedownMentions = (html.match(/phase-?down/gi) || []).length;
  assert.ok(phasedownMentions >= 3, `expected the phase-down to be explained more than once, saw ${phasedownMentions}`);
  const capMentions = (html.match(/\$40,000/g) || []).length;
  assert.ok(capMentions >= 3, `expected the $40,000 cap to appear more than once, saw ${capMentions}`);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  for (const id of ["filing-status", "tax-year", "magi", "salt-paid", "other-itemized", "standard-deduction"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
  }
  assert.match(html, /computeSaltCapDeduction/);
  assert.match(html, /marginalItemizedBenefit/);
});

test("married filing separately is offered as a filing status", () => {
  assert.match(page("index.html"), /<option value="mfs">Married filing separately<\/option>/);
});

test("the page explicitly warns the cap reverts to $10,000 starting 2030", () => {
  assert.match(page("index.html"), /reverts to (a flat )?\$10,000/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("index links one hop to the auto-loan-interest-deduction-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/auto-loan-interest-deduction-calculator\/"/,
    'index must link ../auto-loan-interest-deduction-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
});

test("index links one hop to the senior-deduction-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/senior-deduction-calculator\/"/,
    'index must link ../senior-deduction-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
});

test("index links to the vs-estimating-the-salt-benefit-by-hand comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-estimating-the-salt-benefit-by-hand\.html"/);
});

test("index links to the does-the-salt-cap-increase-help-me guide page", () => {
  assert.match(page("index.html"), /href="\.\/does-the-salt-cap-increase-help-me-if-i-take-the-standard-deduction\.html"/);
});

test("the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const vsPage = page("vs-estimating-the-salt-benefit-by-hand.html");
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
  const vsPage = page("vs-estimating-the-salt-benefit-by-hand.html");
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /vs-estimating-the-salt-benefit-by-hand\.html/);
});

test("the guide page carries the no-warranty clause, valid FAQPage JSON-LD matching visible text, and links back", () => {
  const guide = page("does-the-salt-cap-increase-help-me-if-i-take-the-standard-deduction.html");
  assert.match(guide, /No warranty/);
  assert.match(guide, /Nothing leaves your browser/);
  assert.match(guide, /href="\.\/"/);
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the guide page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(guide.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(guide.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /does-the-salt-cap-increase-help-me-if-i-take-the-standard-deduction\.html/);
});

test("the guide page's worked example matches calc.mjs for the exact inputs stated", async () => {
  const { marginalItemizedBenefit } = await import("./calc.mjs");
  const guide = page("does-the-salt-cap-increase-help-me-if-i-take-the-standard-deduction.html");

  const alreadyOver = marginalItemizedBenefit({ saltDeduction: 25000, otherItemizedDeductions: 40000, standardDeduction: 31500, marginalRatePercent: 24 });
  assert.equal(alreadyOver.marginalSalt, 25000);
  assert.match(guide, /\$25,000/);

  const notOver = marginalItemizedBenefit({ saltDeduction: 8000, otherItemizedDeductions: 5000, standardDeduction: 31500, marginalRatePercent: 24 });
  assert.equal(notOver.marginalSalt, 0);
  assert.equal(notOver.recommendItemize, false);
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

test("the reference tables' projected 2027-2029 figures match calc.mjs's own compounding, not a hand-typed copy", async () => {
  const { saltCapParameters } = await import("./calc.mjs");
  const html = page("index.html");
  for (const year of [2027, 2028, 2029]) {
    const single = saltCapParameters(year, "single");
    const mfs = saltCapParameters(year, "mfs");
    assert.ok(html.includes(`$${single.cap.toLocaleString()}`), `index missing single cap for ${year}: $${single.cap.toLocaleString()}`);
    assert.ok(html.includes(`$${mfs.cap.toLocaleString()}`), `index missing MFS cap for ${year}: $${mfs.cap.toLocaleString()}`);
    assert.ok(html.includes(`$${single.threshold.toLocaleString()}`), `index missing single threshold for ${year}: $${single.threshold.toLocaleString()}`);
    assert.ok(html.includes(`$${mfs.threshold.toLocaleString()}`), `index missing MFS threshold for ${year}: $${mfs.threshold.toLocaleString()}`);
  }
});
