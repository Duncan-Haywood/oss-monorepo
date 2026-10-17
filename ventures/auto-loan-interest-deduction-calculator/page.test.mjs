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

test("index page states the MAGI phase-out and the cap more than once, not only in fine print", () => {
  const html = page("index.html");
  const phaseoutMentions = (html.match(/phase-?out/gi) || []).length;
  assert.ok(phaseoutMentions >= 3, `expected the phase-out to be explained more than once, saw ${phaseoutMentions}`);
  const capMentions = (html.match(/\$10,000/g) || []).length;
  assert.ok(capMentions >= 3, `expected the $10,000 cap to appear more than once, saw ${capMentions}`);
});

test("the calculator inputs and all eight eligibility checklist items are present", () => {
  const html = page("index.html");
  assert.match(html, /id="filing-status"/);
  assert.match(html, /id="magi"/);
  assert.match(html, /id="interest-paid"/);
  assert.match(html, /computeQualifiedVehicleInterestDeduction/);
  for (const key of [
    "isNew", "finalAssemblyUs", "personalUse", "securedFirstLien",
    "isLoanNotLease", "notSalvageOrParts", "vehicleTypeOk", "debtAfter2024",
  ]) {
    assert.match(html, new RegExp(`crit-${key}`), `missing checklist item ${key}`);
  }
});

test("married filing separately is offered as a filing status, and the page states it IS eligible here", () => {
  const html = page("index.html");
  assert.match(html, /<option value="mfs">Married filing separately<\/option>/);
  assert.match(html, /MFS is eligible here|MFS IS eligible|Yes -- and this is the detail/);
});

test("the page explicitly warns the cap does not double for a joint return", () => {
  const html = page("index.html");
  assert.match(html, /does not double/i);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture graduated into the "More free tools" bucket with nothing
// linking to it, so without an explicit one-hop a crawler landing here could
// not reach a sibling at all (platform/pages/siblings.mjs --check orphan
// class) -- the same reasoning no-tax-on-tips-overtime-calculator's own
// page.test.mjs already records, and this venture links back to it too.
test("index links one hop to the no-tax-on-tips-overtime-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/no-tax-on-tips-overtime-calculator\/"/,
    'index must link ../no-tax-on-tips-overtime-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
});

test("index links one hop to the senior-deduction-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/senior-deduction-calculator\/"/,
    'index must link ../senior-deduction-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
});

test("index links to the vs-estimating-the-deduction-by-hand comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-estimating-the-deduction-by-hand\.html"/);
});

test("the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const vsPage = page("vs-estimating-the-deduction-by-hand.html");
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
  const vsPage = page("vs-estimating-the-deduction-by-hand.html");
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /vs-estimating-the-deduction-by-hand\.html/);
});

test("index links to the does-married-filing-separately guide page, and the guide links back", () => {
  assert.match(page("index.html"), /href="\.\/does-married-filing-separately-get-this-deduction\.html"/);
  const guide = page("does-married-filing-separately-get-this-deduction.html");
  assert.match(guide, /href="\.\/"/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /does-married-filing-separately-get-this-deduction\.html/);
});

test("the MFS guide page carries the no-warranty clause and valid FAQPage JSON-LD matching visible text", () => {
  const guide = page("does-married-filing-separately-get-this-deduction.html");
  assert.match(guide, /No warranty/);
  assert.match(guide, /Nothing leaves your browser/);
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the MFS guide page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(guide.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(guide.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the MFS guide page's worked example matches calc.mjs for the exact inputs stated", async () => {
  const { computeQualifiedVehicleInterestDeduction } = await import("./calc.mjs");
  const full = {
    isNew: true, finalAssemblyUs: true, personalUse: true, securedFirstLien: true,
    isLoanNotLease: true, notSalvageOrParts: true, vehicleTypeOk: true, debtAfter2024: true,
  };
  const guide = page("does-married-filing-separately-get-this-deduction.html");

  const mfsSpouse = computeQualifiedVehicleInterestDeduction({ interestPaid: 8000, filingStatus: "mfs", magi: 120000, criteria: full });
  assert.equal(mfsSpouse.deduction, 6000);
  assert.match(guide, /\$6,000/);

  const joint = computeQualifiedVehicleInterestDeduction({ interestPaid: 8000, filingStatus: "joint", magi: 240000, criteria: full });
  assert.equal(joint.deduction, 2000);
  assert.match(guide, /\$2,000/);

  assert.match(guide, /\$12,000/); // the two MFS spouses' combined deduction
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

test("footer links the sibling tool car-lease-deal-checker", () => {
  assert.match(page("index.html"), /href="\.\.\/car-lease-deal-checker\/"/);
});
