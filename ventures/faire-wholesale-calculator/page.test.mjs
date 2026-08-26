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
  for (const html of [brand, retailer, explainer, floatSeo]) {
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

test("retailer page renders landed cost, unsold units, and target retail price", () => {
  const script = retailerParsed.scripts.join("\n");
  assert.match(script, /result\.landedCost/);
  assert.match(script, /result\.unsoldUnits/);
  assert.match(script, /result\.roi/);
  assert.match(script, /retailPriceForMargin/);
});
