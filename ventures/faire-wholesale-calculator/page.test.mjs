import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

import { comparePayoutSpeedsAfterFloat, summarizePayoutFloat } from "./calc.mjs";

const brand = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const retailer = readFileSync(new URL("./retailer.html", import.meta.url), "utf8");
const explainer = readFileSync(new URL("./faire-direct-vs-marketplace.html", import.meta.url), "utf8");
const floatSeo = readFileSync(new URL("./should-i-pay-for-faire-next-day-payout.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const openHousePage = readFileSync(new URL("./should-i-list-during-faire-open-house.html", import.meta.url), "utf8");
const promotedPage = readFileSync(new URL("./should-i-run-faire-promoted-listings.html", import.meta.url), "utf8");
const returnPage = readFileSync(new URL("./should-i-take-this-faire-return.html", import.meta.url), "utf8");
const payNowPage = readFileSync(new URL("./should-i-offer-faire-pay-now.html", import.meta.url), "utf8");
const brandParsed = parse(brand);
const retailerParsed = parse(retailer);
const rowTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{result\.label\}[\s\S]*?`;/);

test("every raw-text element is closed on the brand page", () => {
  assert.equal(brandParsed.unclosed, null, `<${brandParsed.unclosed}> is never closed`);
});

test("every raw-text element is closed on the retailer page", () => {
  assert.equal(retailerParsed.unclosed, null, `<${retailerParsed.unclosed}> is never closed`);
});

test("the brand results row template exists", () => {
  assert.ok(rowTemplate, "could not find the per-path <tr> innerHTML template");
});

test("every results column has a cell, and every cell has a column", () => {
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Path", "Fees", "Payout", "Profit", "Margin", "Gives up"].includes(text));
  const cells = (rowTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `comparison table declares ${headers.length} columns (${headers.join(" | ")}) but the row emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = brand.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const script = brandParsed.scripts.join("\n");
  const claims = [
    ["net profit", /result\.profit/],
    ["margin", /result\.margin/],
    ["ROI", /first\.roi/],
    ["wholesale price for a target margin", /wholesaleForMargin/],
    ["Faire Direct", /faire_direct|Faire Direct/],
    ["retailer lifetime", /compareRetailerLifetime/],
    ["payout-speed after carrying cost", /comparePayoutSpeedsAfterFloat/],
    ["Open House", /compareOpenHouse|openHouseNote/],
    ["Promoted Listings leftover after last-click organic", /compareFairePromoted|promotedNote/],
    ["keep-it credit vs deny vs taking a Faire return", /compareFaireReturn|faireReturnNote/],
    ["Pay Now leftover after Faire remittance wait", /compareFairePayNow|payNowNote/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(script, rendered, `featureList advertises "${claim}" but the page never renders ${rendered}`);
  }
});

test("brand and retailer pages show the disclaimer a user can actually read", () => {
  for (const html of [brand, retailer, explainer, floatSeo, openHousePage, promotedPage, returnPage, payNowPage]) {
    assert.match(html, /No warranty/);
    assert.match(html, /not tax, financial, or business advice/i);
    assert.match(html, /Not affiliated with Faire|Not affiliated with Faire Wholesale/i);
    assert.match(html, /Best-effort hosting, no SLA/);
    assert.match(html, /GitHub Sponsors/);
  }
});

test("the next-day payout landing page uses the same worked example the tests lock", () => {
  const comparison = comparePayoutSpeedsAfterFloat({
    unitWholesale: 20,
    quantity: 10,
    unitCogs: 8,
    shippingReimbursement: 15,
    shippingCost: 15,
    region: "north_america",
    payout: "day_60",
    annualCarryRate: 24,
  });
  const cheap = comparePayoutSpeedsAfterFloat({
    unitWholesale: 20,
    quantity: 10,
    unitCogs: 8,
    shippingReimbursement: 15,
    shippingCost: 15,
    region: "north_america",
    annualCarryRate: 6,
  });
  assert.match(floatSeo, /<title>Should I pay for Faire next-day payout\?/);
  assert.match(floatSeo, /name="description"/);
  assert.match(floatSeo, /FAQPage/);
  assert.match(floatSeo, /href="\.\/"/);
  assert.match(floatSeo, /\$72\.59/);
  assert.match(floatSeo, /\$69\.28/);
  assert.match(floatSeo, /\$74\.25/);
  assert.match(floatSeo, /\$3\.20/);
  assert.match(floatSeo, /11\.8%/);
  assert.match(floatSeo, /GitHub Sponsors/);
  assert.match(brand, /id="annualCarryRate"/);
  assert.match(brand, /should-i-pay-for-faire-next-day-payout\.html/);
  assert.match(sitemap, /should-i-pay-for-faire-next-day-payout\.html/);
  assert.equal(comparison.nextDayBeatsSlow, true);
  assert.equal(cheap.nextDayBeatsSlow, false);
  assert.match(summarizePayoutFloat(comparison), /\$72\.59/);
});

test("float table columns match the payout-speed row template", () => {
  const floatTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{speed\.label\}<\/td><td>\$\{speed\.waitDays\}d[\s\S]*?`;/);
  assert.ok(floatTemplate, "could not find the payout-speed <tr> innerHTML template");
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Payout speed", "Wait", "Processing", "Before float", "Carrying", "After float"].includes(text));
  const cells = (floatTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers.length, `float table declares ${headers.length} columns but the row emits ${cells} cells`);
});

test("lifetime table columns match the relationship-row template", () => {
  const lifetimeTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{result\.label\}<\/td><td>\$\{result\.orders\}[\s\S]*?`;/);
  assert.ok(lifetimeTemplate, "could not find the lifetime <tr> innerHTML template");
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Relationship", "Orders", "Lifetime fees", "Lifetime profit", "vs best path"].includes(text));
  const cells = (lifetimeTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers.length, `lifetime table declares ${headers.length} columns but the row emits ${cells} cells`);
});

test("Promoted listings table columns match the campaign-row template", () => {
  const promotedTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{result\.label\}<\/td><td>\$\{result\.campaignRate[\s\S]*?`;/);
  assert.ok(promotedTemplate, "could not find the Promoted listings <tr> innerHTML template");
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Campaign", "Rate", "Extra orders", "Campaign leftover", "vs skip"].includes(text));
  const cells = (promotedTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers.length, `promoted table declares ${headers.length} columns but the row emits ${cells} cells`);
});

test("return table columns match the return-row template", () => {
  const returnTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{result\.label\}<\/td><td>\$\{money\(result\.leftover\)\}[\s\S]*?`;/);
  assert.ok(returnTemplate, "could not find the return <tr> innerHTML template");
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Choice", "Leftover", "vs keep-it"].includes(text));
  const cells = (returnTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers.length, `return table declares ${headers.length} columns but the row emits ${cells} cells`);
});

test("Pay Now table columns match the remittance-row template", () => {
  const payNowTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{result\.label\}<\/td><td>\$\{result\.payNowRate[\s\S]*?`;/);
  assert.ok(payNowTemplate, "could not find the Pay Now <tr> innerHTML template");
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Pay Now path", "Pay Now %", "Remit days", "Pay Now leftover", "vs Net terms"].includes(text));
  const cells = (payNowTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers.length, `Pay Now table declares ${headers.length} columns but the row emits ${cells} cells`);
});

test("Open House table columns match the window-row template", () => {
  const openHouseTemplate = brandParsed.scripts.join("\n").match(/row\.innerHTML = `<td>\$\{result\.label\}<\/td><td>\$\{result\.discountRate[\s\S]*?`;/);
  assert.ok(openHouseTemplate, "could not find the Open House <tr> innerHTML template");
  const headers = [...brandParsed.markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((text) => ["Window", "Event discount", "First-order leftover", "vs everyday", "Window leftover"].includes(text));
  const cells = (openHouseTemplate[0].match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers.length, `Open House table declares ${headers.length} columns but the row emits ${cells} cells`);
});

test("retailer page renders landed cost, unsold units, and target retail price", () => {
  const script = retailerParsed.scripts.join("\n");
  assert.match(script, /result\.landedCost/);
  assert.match(script, /result\.unsoldUnits/);
  assert.match(script, /result\.roi/);
  assert.match(script, /retailPriceForMargin/);
});

test("a rejected input clears the order-summary figures, not just the compare/lifetime sections", () => {
  // Before this fix, update()'s catch block wrote the error message into
  // #profit/#label and cleared the comparison table, lifetime table, and
  // every scenario section below -- but never touched the seven <dd> lines
  // (order subtotal, commission, processing, payout, cash out, margin, ROI)
  // right above them. A negative unit price, a discount at or above 100%, or
  // any other rejected input left those seven figures showing the *last
  // valid* order next to the error message, easy to misread as the answer
  // for what is now in the form. Same bug class fixed in job-margin-variance
  // (#2446), notary-trip-quote (#2450), subscription-price-impact (#2452),
  // and retainage-cashflow-calculator (#2453).
  const script = brandParsed.scripts.join("\n");
  const catchBlock = script.match(/}\s*catch \(error\) \{([\s\S]*?)\n {6}\}\n {4}\}/);
  assert.ok(catchBlock, "update() catch block not found");
  const body = catchBlock[1];
  for (const id of ["subtotal", "commission", "processing", "payoutAmount", "cash", "margin", "roi"]) {
    assert.match(
      body,
      new RegExp(`field\\("${id}"\\)\\.textContent = ""`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
});

test("the result panel is announced to screen readers when it updates", () => {
  // The result section re-renders in place on every keystroke, with no
  // page reload. Before this fix the only aria-live element on the page
  // was #status (a copy message the render code never writes the result
  // figures into), so a screen-reader user changing an input got no
  // announcement that the readout had changed.
  assert.match(
    brand,
    /<section class="result" aria-live="polite">/,
    "the result section is not a live region, so updates are never announced",
  );
});

// marketplace-fee-compare's lowest-fees article already deep-links here as the
// wholesale sibling it deliberately excludes from the retail ranking. Without
// the reverse link, a crawler entering on this hub never reaches that compare —
// same one-way orphan class as #3639 / #3650 / #3667.
test("index links to the related marketplace fee compare hub", () => {
  assert.match(
    brand,
    /href="\.\.\/marketplace-fee-compare\/"/,
    "index must link ../marketplace-fee-compare/ so crawlers can reach the retail fee ranking",
  );
});
