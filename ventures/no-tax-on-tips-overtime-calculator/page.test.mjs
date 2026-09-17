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

test("index page states the phase-out and half-time-premium rules more than once, not only in fine print", () => {
  const html = page("index.html");
  const phaseoutMentions = (html.match(/phase-?out/gi) || []).length;
  assert.ok(phaseoutMentions >= 3, `expected the phase-out to be explained more than once, saw ${phaseoutMentions}`);
  const halfTimeMentions = (html.match(/half-time premium|half the (blended )?rate|extra 0\.5x/gi) || []).length;
  assert.ok(halfTimeMentions >= 2, `expected the half-time-premium-only rule to appear more than once, saw ${halfTimeMentions}`);
});

test("both calculator sections and their inputs are present", () => {
  const html = page("index.html");
  assert.match(html, /id="filing-status"/);
  assert.match(html, /id="magi"/);
  assert.match(html, /id="qualified-tips"/);
  assert.match(html, /id="occupation-eligible"/);
  assert.match(html, /id="self-employed"/);
  assert.match(html, /id="ot-known"/);
  assert.match(html, /id="add-ot-row"/);
  assert.match(html, /computeCombinedEstimate/);
});

test("married filing separately is offered as a filing status so the calculator can warn about it", () => {
  assert.match(page("index.html"), /<option value="mfs">Married filing separately<\/option>/);
});

test("the estimate is counted as its own usage event, distinct from example loads", () => {
  const html = page("index.html");
  assert.match(html, /record\("estimate_calculated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// This venture graduated into the "More free tools" bucket with nothing
// linking to it, so without an explicit one-hop a crawler landing here
// could not reach a sibling at all (platform/pages/siblings.mjs --check
// orphan class) -- the same reasoning overtime-pay-calculator's own
// page.test.mjs already records.
test("index links one hop to the overtime-pay-calculator sibling for the blended-rate case", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/overtime-pay-calculator\/"/,
    'index must link ../overtime-pay-calculator/ so crawlers reach the blended-rate calculator in one hop',
  );
  assert.match(html, /overtime pay calculator/i);
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
