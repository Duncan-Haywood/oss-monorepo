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

test("index page states the MAGI phase-out and the $6,000 amount more than once, not only in fine print", () => {
  const html = page("index.html");
  const phaseoutMentions = (html.match(/phase-?out/gi) || []).length;
  assert.ok(phaseoutMentions >= 3, `expected the phase-out to be explained more than once, saw ${phaseoutMentions}`);
  const amountMentions = (html.match(/\$6,000/g) || []).length;
  assert.ok(amountMentions >= 3, `expected the $6,000 amount to appear more than once, saw ${amountMentions}`);
});

test("the calculator inputs are present", () => {
  const html = page("index.html");
  assert.match(html, /id="filing-status"/);
  assert.match(html, /id="magi"/);
  assert.match(html, /id="self-qualifies"/);
  assert.match(html, /id="spouse-qualifies"/);
  assert.match(html, /computeSeniorDeduction/);
});

test("all five filing statuses are offered, including qualifying surviving spouse", () => {
  const html = page("index.html");
  for (const value of ["single", "hoh", "qss", "joint", "mfs"]) {
    assert.match(html, new RegExp(`<option value="${value}">`), `missing filing status option ${value}`);
  }
});

test("married filing separately is stated as fully excluded, not just reduced", () => {
  const html = page("index.html");
  assert.match(html, /Married filing separately (cannot|is excluded)/i);
});

test("the page explicitly states two qualifying spouses phase out at the SAME income as one", () => {
  const html = page("index.html");
  assert.match(html, /same (household MAGI|MAGI|income)/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture must ship with an inbound sibling link from its first commit
// (platform/pages/siblings.mjs --check, orphan budget committed at 0) --
// paired with the two other new OBBBA individual-deduction calculators this
// portfolio already ships, a genuine topical pairing (all three are new,
// temporary 2025-2028 deductions a 2025 filer may claim in the same season).
test("index links one hop to both sibling OBBBA deduction calculators", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/auto-loan-interest-deduction-calculator\/"/,
    'index must link ../auto-loan-interest-deduction-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
  assert.match(
    html,
    /href="\.\.\/no-tax-on-tips-overtime-calculator\/"/,
    'index must link ../no-tax-on-tips-overtime-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
  assert.match(
    html,
    /href="\.\.\/mega-backdoor-roth-calculator\/"/,
    'index must link ../mega-backdoor-roth-calculator/ so crawlers reach the sibling 401(k) calculator in one hop',
  );
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

test("index links one hop to the mega-backdoor-roth-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/mega-backdoor-roth-calculator\/"/,
    "index must link ../mega-backdoor-roth-calculator/ so crawlers reach the sibling retirement calculator in one hop",
  );
});

test("index links to the phase-out guide page, and the guide links back", () => {
  assert.match(page("index.html"), /href="\.\/why-does-the-senior-deduction-phase-out-completely\.html"/);
  const guide = page("why-does-the-senior-deduction-phase-out-completely.html");
  assert.match(guide, /href="\.\/"/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /why-does-the-senior-deduction-phase-out-completely\.html/);
});

test("the phase-out guide page carries the no-warranty clause and valid FAQPage JSON-LD matching visible text", () => {
  const guide = page("why-does-the-senior-deduction-phase-out-completely.html");
  assert.match(guide, /No warranty/);
  assert.match(guide, /Nothing leaves your browser/);
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the phase-out guide page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(guide.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(guide.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the phase-out guide page's worked examples match calc.mjs for the exact inputs stated", async () => {
  const { computeSeniorDeduction } = await import("./calc.mjs");
  const guide = page("why-does-the-senior-deduction-phase-out-completely.html");

  const single100k = computeSeniorDeduction({ filingStatus: "single", magi: 100000, selfQualifies: true });
  assert.equal(single100k.deduction, 4500);
  const single150k = computeSeniorDeduction({ filingStatus: "single", magi: 150000, selfQualifies: true });
  assert.equal(single150k.deduction, 1500);
  const single175k = computeSeniorDeduction({ filingStatus: "single", magi: 175000, selfQualifies: true });
  assert.equal(single175k.deduction, 0);

  const jointBoth200k = computeSeniorDeduction({ filingStatus: "joint", magi: 200000, selfQualifies: true, spouseQualifies: true });
  assert.equal(jointBoth200k.deduction, 6000);
  const jointBoth250k = computeSeniorDeduction({ filingStatus: "joint", magi: 250000, selfQualifies: true, spouseQualifies: true });
  assert.equal(jointBoth250k.deduction, 0);
  const jointOne250k = computeSeniorDeduction({ filingStatus: "joint", magi: 250000, selfQualifies: true, spouseQualifies: false });
  assert.equal(jointOne250k.deduction, 0);

  for (const amount of ["$175,000", "$250,000", "$4,500", "$1,500", "$6,000", "$12,000"]) {
    assert.ok(guide.includes(amount), `guide page missing expected figure: ${amount}`);
  }
});
