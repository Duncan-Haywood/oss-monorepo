import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./vs-bidding-a-flat-percentage.html", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, or legal advice/);
});

test("names no specific auction platform, forum, or vendor", () => {
  // This is the generic-method angle ("a flat percentage"), not a
  // named-product comparison, so it must not read as a claim about any
  // specific auction site -- distinct from this venture's own
  // vs-storagetreasures.html, which does name a product.
  assert.doesNotMatch(html, /StorageTreasures|Lockerfox|storagestuff|storageauctions\.com/i);
});

test("the FAQPage JSON-LD is valid and every question/answer is verbatim on the page", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?\})<\/script>/);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length >= 3, "FAQPage should carry at least 3 questions");
  for (const { "@type": type, name, acceptedAnswer } of schema.mainEntity) {
    assert.equal(type, "Question");
    assert.ok(html.includes(`<h3>${name}</h3>`), `question not found verbatim as an <h3>: ${name}`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test("the canonical tag names this file", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-bidding-a-flat-percentage\.html">/);
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-bidding-a-flat-percentage\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  assert.match(sitemap, /vs-bidding-a-flat-percentage\.html/);
});

test("links back to the calculator", () => {
  assert.match(html, /<a href="\.\/">/);
});

test("the worked-example figures match the calculator's own default output", async () => {
  const { calculateMaxBid } = await import("./calc.mjs");
  const r = calculateMaxBid({
    estimatedRetailValue: "4000",
    recoveryRatePercent: "35",
    resaleFeePercent: "15",
    buyerPremiumPercent: "12",
    plannedBid: "50",
    dumpFeePerLoad: "90",
    estimatedDumpLoads: "3",
    transportCost: "60",
    cleanoutPersonHours: "10",
    laborRatePerHour: "20",
    crewSize: "2",
    cleanoutWindowHours: "48",
    cleanoutDepositAmount: "100",
    holdingCostPerMonth: "60",
    monthsToLiquidate: "2",
    targetMarginPercent: "40",
    naiveRuleBidPercent: "20",
  });
  // Pinned against the page's own prose so a future calc.mjs change that
  // moves these numbers is caught here rather than only in calc.test.mjs.
  assert.equal(r.naiveRuleBid.toFixed(2), "800.00");
  assert.equal(r.breakEvenBid.toFixed(2), "482.14");
  assert.equal(r.maxBidAtTargetMargin.toFixed(2), "57.14");
  assert.match(html, /\$800/);
  assert.match(html, /\$482\.14/);
  assert.match(html, /\$57\.14/);
});

test("this generic-method page is registered as disclaimer-exempt and within the surface budget", async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import("../../platform/pages/clauses.mjs");
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has("storage-auction-max-bid-calculator/vs-bidding-a-flat-percentage.html"),
    "vs-bidding-a-flat-percentage.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product",
  );
});
