// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareBulkBuy, compareCoupons, compareInboundPlacement, compareMcf, comparePrep, compareSellerPlans, compareSubscribeSave } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const couponSeo = readFileSync(new URL("./does-this-amazon-coupon-still-pay.html", import.meta.url), "utf8");
const lowPriceSeo = readFileSync(
  new URL("./should-i-price-over-amazons-low-price-fba.html", import.meta.url),
  "utf8",
);
const mcfSeo = readFileSync(
  new URL("./should-i-use-amazon-mcf-for-website-orders.html", import.meta.url),
  "utf8",
);
const snsSeo = readFileSync(
  new URL("./does-subscribe-and-save-still-pay.html", import.meta.url),
  "utf8",
);
const bulkSeo = readFileSync(
  new URL("./does-this-amazon-moq-still-pay.html", import.meta.url),
  "utf8",
);
const prepSeo = readFileSync(
  new URL("./should-i-pay-amazon-to-prep-inbound.html", import.meta.url),
  "utf8",
);
const placementSeo = readFileSync(
  new URL("./inbound-placement-fee.html", import.meta.url),
  "utf8",
);
const planSeo = readFileSync(
  new URL("./individual-vs-professional.html", import.meta.url),
  "utf8",
);
const packSeo = readFileSync(
  new URL("./does-smaller-box-cut-amazon-fba-fees.html", import.meta.url),
  "utf8",
);
const sfpSeo = readFileSync(
  new URL("./should-i-use-seller-fulfilled-prime.html", import.meta.url),
  "utf8",
);
const awdSeo = readFileSync(
  new URL("./should-i-use-amazon-awd.html", import.meta.url),
  "utf8",
);
const narfSeo = readFileSync(
  new URL("./should-i-use-amazon-remote-fulfillment.html", import.meta.url),
  "utf8",
);
const acosSeo = readFileSync(new URL("./break-even-acos.html", import.meta.url), "utf8");
const vsAmazonSeo = readFileSync(new URL("./vs-amazon-revenue-calculator.html", import.meta.url), "utf8");

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

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the coupon row template has one cell per column", () => {
  const couponMarkup = markup.split('id="couponCompare"')[0];
  const headerBlock = couponMarkup.slice(couponMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Offer", "Buyer pays", "Profit", "vs list", "Hits target?"]);
  assert.match(scriptSource, /money\(row\.buyerPays\)/);
  assert.match(scriptSource, /money\(row\.profit\)/);
  assert.match(scriptSource, /signed\(row\.profitDelta\)/);
  assert.match(scriptSource, /row\.hitsTarget/);
  assert.match(scriptSource, /couponSummary\(coupons\)/);
});

test("schema.org featureList names the comparisons the page actually renders", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "featureList missing");
  assert.match(featureList[1], /coupon vs list profit/i);
  assert.match(featureList[1], /Subscribe & Save vs list profit/i);
  assert.match(featureList[1], /Low-Price FBA/i);
  assert.match(featureList[1], /Multi-Channel Fulfillment/i);
  assert.match(featureList[1], /supplier MOQ/i);
  assert.match(featureList[1], /you-prep vs Amazon inbound prep/i);
  assert.match(featureList[1], /inbound placement vs split freight/i);
  assert.match(featureList[1], /Individual vs Professional seller plan/i);
  assert.match(featureList[1], /seller-plan volume ladder/i);
  assert.match(featureList[1], /aged inventory vs remove vs dispose/i);
  assert.match(featureList[1], /FBA Liquidations vs dispose vs sell-elsewhere/i);
  assert.match(featureList[1], /expected returns/i);
  assert.match(featureList[1], /return-rate sweep/i);
  assert.match(featureList[1], /peak vs off-peak Q4 storage/i);
  assert.match(featureList[1], /size-tier packaging cliff/i);
  assert.match(featureList[1], /Seller Fulfilled Prime vs FBA vs FBM/i);
  assert.match(featureList[1], /restock vs low-inventory-level fee/i);
  assert.match(featureList[1], /Vine leftover vs sellable/i);
  assert.match(featureList[1], /Amazon AWD vs send-all-to-FBA vs you-hold/i);
  assert.match(featureList[1], /Remote Fulfillment vs skip Canada vs a Canada FBA pile/i);
  assert.match(featureList[1], /break-even ACOS/i);
  assert.match(featureList[1], /target-margin ACOS/i);
  assert.match(markup, /peak-vs-off-peak-storage\.html/);
  assert.match(markup, /does-smaller-box-cut-amazon-fba-fees\.html/);
  assert.match(markup, /should-i-use-seller-fulfilled-prime\.html/);
  assert.match(markup, /low-inventory-level-fee\.html/);
  assert.match(markup, /id="low-inventory"/);
  assert.match(scriptSource, /compareLowInventory/);
  assert.match(scriptSource, /low_inventory_compared/);
  assert.match(markup, /should-i-use-amazon-awd\.html/);
  assert.match(markup, /should-i-use-amazon-remote-fulfillment\.html/);
  assert.match(markup, /should-i-liquidate-aged-fba-inventory\.html/);
  assert.match(markup, /id="liquidation"/);
  assert.match(scriptSource, /compareLiquidation/);
  assert.match(scriptSource, /liquidation_compared/);
  assert.match(scriptSource, /agedRemovalFee/);
  assert.match(markup, /is-amazon-vine-worth-it\.html/);
  assert.match(markup, /id="vine"/);
  assert.match(scriptSource, /compareVine/);
  assert.match(scriptSource, /vine_compared/);
  assert.match(markup, /id="sfp"/);
  assert.match(scriptSource, /compareSfp/);
  assert.match(scriptSource, /sfp_compared/);
  assert.match(markup, /id="returnsCompare"/);
  assert.match(markup, /id="returnRate"/);
  assert.match(markup, /do-amazon-returns-wipe-the-profit\.html/);
  assert.match(markup, /id="bulkCompare"/);
  assert.match(markup, /id="prepCompare"/);
  assert.match(markup, /id="placementCompare"/);
  assert.match(markup, /should-i-pay-amazon-to-prep-inbound\.html/);
  assert.match(markup, /inbound-placement-fee\.html/);
  assert.match(markup, /does-this-amazon-moq-still-pay\.html/);
  assert.match(markup, /id="couponCompare"/);
  assert.match(markup, /id="couponPercent"/);
  assert.match(markup, /id="snsCompare"/);
  assert.match(markup, /does-this-amazon-coupon-still-pay\.html/);
  assert.match(markup, /does-subscribe-and-save-still-pay\.html/);
  assert.match(markup, /break-even-acos\.html/);
  assert.match(markup, /id="currentAcos"/);
  assert.match(markup, /id="breakEvenAcos"/);
  assert.match(markup, /id="targetMarginAcos"/);
});

test("the FBA vs FBM row template includes break-even ACOS", () => {
  const compareMarkup = markup.split('id="compare"')[0];
  const headerBlock = compareMarkup.slice(compareMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Path", "Fees", "Profit", "Max buy", "Break-even ACOS"]);
  assert.match(scriptSource, /formatAcos\(path\.breakEvenAcos\)/);
  assert.match(scriptSource, /formatAcos\(result\.selected\.currentAcos\)/);
  assert.match(scriptSource, /formatAcos\(result\.selected\.breakEvenAcos\)/);
  assert.match(scriptSource, /break_even_acos_calculated/);
});

test("ACOS SEO page names the question and keeps the playbook footer", () => {
  assert.match(acosSeo, /What is break-even ACOS on Amazon/);
  assert.match(acosSeo, /No warranty/);
  assert.match(acosSeo, /Best-effort hosting, no SLA/);
  assert.match(acosSeo, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("calculator page wires the Low-Price FBA comparison", () => {
  assert.match(html, /compareLowPriceFba/);
  assert.match(html, /id="lowPriceCompare"/);
  assert.match(html, /id="lowPriceBreakEven"/);
  assert.match(html, /low_price_fba_compared/);
  assert.match(html, /should-i-price-over-amazons-low-price-fba.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("SEO page uses the same coupon worked example the tests lock", () => {
  const comparison = compareCoupons({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
    couponPercent: 15,
    couponFee: 0.6,
  });
  assert.match(couponSeo, /\$25\.49/);
  assert.match(couponSeo, /\$6\.57/);
  assert.match(couponSeo, /\$4\.42/);
  assert.match(couponSeo, /67% lift/);
  assert.match(couponSeo, /\$10\.99/);
  assert.ok(comparison.typed.profit > 6.56 && comparison.typed.profit < 6.58);
});

test("calculator page wires the MCF comparison", () => {
  assert.match(html, /compareMcf/);
  assert.match(html, /id="mcfCompare"/);
  assert.match(html, /id="mcfBreakEven"/);
  assert.match(html, /mcf_compared/);
  assert.match(html, /should-i-use-amazon-mcf-for-website-orders.html/);
  const mcfMarkup = markup.split('id="mcfCompare"')[0];
  const headerBlock = mcfMarkup.slice(mcfMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Path", "Price", "Fees", "Profit", "vs Amazon"]);
  assert.match(scriptSource, /money\(row\.salePrice\)/);
  assert.match(scriptSource, /money\(row\.feeTotal\)/);
  assert.match(scriptSource, /signed\(row\.profitDelta\)/);
});

test("MCF SEO page uses the same worked example the tests lock", () => {
  const comparison = compareMcf({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
  });
  assert.match(mcfSeo, /\$11\.92/);
  assert.match(mcfSeo, /\$10\.99/);
  assert.match(mcfSeo, /\$14\.97/);
  assert.match(mcfSeo, /\$7\.48/);
  assert.match(mcfSeo, /\$6\.55/);
  assert.match(mcfSeo, /No warranty/);
  assert.match(mcfSeo, /Best-effort hosting, no SLA/);
  assert.match(mcfSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  nearEnough(comparison.mcf.profit, 11.92);
  nearEnough(comparison.amazon.profit, 10.99);
  nearEnough(comparison.selfShip.profit, 14.97);
});

function nearEnough(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${actual} vs ${expected}`);
}

test("the Subscribe & Save row template has one cell per column", () => {
  const snsMarkup = markup.split('id="snsCompare"')[0];
  const headerBlock = snsMarkup.slice(snsMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Offer", "Buyer pays", "Profit", "vs list", "Hits target?"]);
  assert.match(scriptSource, /compareSubscribeSave\(readInput\(\)\)/);
  assert.match(scriptSource, /subscribeSaveSummary\(sns\)/);
  assert.match(html, /subscribe_save_compared/);
  assert.match(html, /id="snsPercent"/);
  assert.match(html, /id="snsEnrollPct"/);
});

test("SEO page uses the same Subscribe & Save worked example the tests lock", () => {
  const comparison = compareSubscribeSave({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
    snsPercent: 5,
    snsEnrollPct: 40,
  });
  assert.match(snsSeo, /\$28\.49/);
  assert.match(snsSeo, /\$9\.72/);
  assert.match(snsSeo, /\$1\.27/);
  assert.match(snsSeo, /\$838\.68/);
  assert.match(snsSeo, /\$879\.46/);
  assert.match(snsSeo, /4\.2 new S&amp;S-only sales/);
  assert.match(snsSeo, /\$7\.17/);
  assert.match(snsSeo, /No warranty/);
  assert.match(snsSeo, /Best-effort hosting, no SLA/);
  assert.match(snsSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  nearEnough(comparison.typed.profit, 9.72);
  nearEnough(comparison.mixedMonthlyProfit, 838.68);
  nearEnough(comparison.offsetUnits, 4.2);
});

test("Low-Price SEO page states the penny-raise trap and the break-even raise", () => {
  assert.match(lowPriceSeo, /Low-Price FBA/);
  assert.match(lowPriceSeo, /\$11\.05/);
  assert.match(lowPriceSeo, /one-cent raise/);
  assert.match(lowPriceSeo, /No warranty/);
});

test("the bulk-buy row template has one cell per column", () => {
  const bulkMarkup = markup.split('id="bulkCompare"')[0];
  const headerBlock = bulkMarkup.slice(bulkMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Order", "COGS", "Months", "Profit", "vs usual"]);
  assert.match(scriptSource, /compareBulkBuy\(readInput\(\)\)/);
  assert.match(html, /bulk_buy_compared/);
  assert.match(html, /id="smallOrderQty"/);
  assert.match(html, /id="largeOrderQty"/);
  assert.match(html, /id="largeCogs"/);
});

test("SEO page uses the same MOQ worked example the tests lock", () => {
  const comparison = compareBulkBuy({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
    smallOrderQty: 100,
    largeOrderQty: 500,
    largeCogs: 6.5,
    largeInboundPerUnit: 0.9,
  });
  assert.match(bulkSeo, /\$10\.99/);
  assert.match(bulkSeo, /\$12\.60/);
  assert.match(bulkSeo, /\$1\.61/);
  assert.match(bulkSeo, /\$803\.33/);
  assert.match(bulkSeo, /\$3335\.95/);
  assert.match(bulkSeo, /\$8\.11/);
  assert.match(bulkSeo, /26\.0 months/);
  assert.match(bulkSeo, /\$7\.81/);
  assert.match(bulkSeo, /No warranty/);
  assert.match(bulkSeo, /Best-effort hosting, no SLA/);
  assert.match(bulkSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  nearEnough(comparison.small.profit, 10.99);
  nearEnough(comparison.large.profit, 12.6);
  nearEnough(comparison.extraProfit, 1.61);
  nearEnough(comparison.pileDelta, 803.33);
  nearEnough(comparison.extraCapital, 3335.95);
  nearEnough(comparison.breakEvenLargeCogs, 8.11);
});

test("the prep row template has one cell per column", () => {
  const prepMarkup = markup.split('id="prepCompare"')[0];
  const headerBlock = prepMarkup.slice(prepMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Prep", "Cost", "Profit", "vs you-prep", "Hits target?"]);
  assert.match(scriptSource, /comparePrep\(readInput\(\)\)/);
  assert.match(scriptSource, /prepSummary\(prep\)/);
  assert.match(html, /prep_compared/);
  assert.match(html, /id="amazonLabelFee"/);
  assert.match(html, /id="amazonBagFee"/);
  assert.match(html, /id="amazonBubbleFee"/);
  assert.match(html, /id="amazonPrepFee"/);
});

test("SEO page uses the same prep worked example the tests lock", () => {
  const comparison = comparePrep({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
  });
  assert.match(prepSeo, /\$10\.99/);
  assert.match(prepSeo, /\$11\.29/);
  assert.match(prepSeo, /\$0\.30/);
  assert.match(prepSeo, /\$24\.00/);
  assert.match(prepSeo, /\$0\.85/);
  assert.match(prepSeo, /\$0\.25/);
  assert.match(prepSeo, /\$10\.74/);
  assert.match(prepSeo, /\$1\.65/);
  assert.match(prepSeo, /\$9\.94/);
  assert.match(prepSeo, /\$1\.05/);
  assert.match(prepSeo, /\$0\.60/);
  assert.match(prepSeo, /No warranty/);
  assert.match(prepSeo, /Best-effort hosting, no SLA/);
  assert.match(prepSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  nearEnough(comparison.diy.profit, 10.99);
  nearEnough(comparison.label.profit, 11.29);
  nearEnough(comparison.labelBag.profit, 10.74);
  nearEnough(comparison.full.profit, 9.94);
  nearEnough(comparison.label.monthlyDelta, 24);
});

test("calculator page wires return-rate columns that match the row template", () => {
  const returnsMarkup = markup.split('id="returnsCompare"')[0];
  const headerBlock = returnsMarkup.slice(returnsMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Return rate", "Expected profit", "Drag", "Margin", "Max buy"]);
  assert.match(scriptSource, /compareReturns/);
  assert.match(scriptSource, /returnsSummary/);
  assert.match(scriptSource, /return_rate_calculated/);
  assert.match(html, /do-amazon-returns-wipe-the-profit\.html/);
});

test("calculator page wires inbound-placement columns that match the row template", () => {
  const placementMarkup = markup.split('id="placementCompare"')[0];
  const headerBlock = placementMarkup.slice(placementMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Split", "Freight", "Placement", "Total inbound", "Per unit", "vs cheapest"]);
  assert.match(scriptSource, /compareInboundPlacement/);
  assert.match(scriptSource, /placementSummary/);
  assert.match(scriptSource, /inbound_placement_compared/);
  assert.match(html, /inbound-placement-fee\.html/);
});

test("SEO page uses the same inbound-placement worked example the tests lock", () => {
  const comparison = compareInboundPlacement({
    units: 200,
    freightMinimal: 85,
    freightPartial: 140,
    freightOptimized: 210,
    placementMinimalPerUnit: 0.43,
    placementPartialPerUnit: 0.27,
    placementOptimizedPerUnit: 0,
  });
  assert.match(placementSeo, /\$171\.00/);
  assert.match(placementSeo, /\$194\.00/);
  assert.match(placementSeo, /\$210\.00/);
  assert.match(placementSeo, /\$23\.00/);
  assert.match(placementSeo, /\$86\.00/);
  assert.match(placementSeo, /No warranty/);
  assert.match(placementSeo, /Best-effort hosting, no SLA/);
  assert.match(placementSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.equal(comparison.winner, "minimal");
});

test("the listing and inbound-placement scripts actually execute", () => {
  assert.match(scriptSource, /compareInboundPlacement/);
  assert.match(scriptSource, /calculateListing/);
  assert.match(markup, /id="inbound-placement"/);
  for (const id of [
    "placementUnits",
    "freightMinimal",
    "freightPartial",
    "freightOptimized",
    "placementMinimalPerUnit",
    "placementPartialPerUnit",
    "placementCompare",
    "placementVerdict",
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
});

test("SEO page names the inbound-placement question and links back", () => {
  assert.match(placementSeo, /inbound placement/i);
  assert.match(placementSeo, /<a href="\.\/#inbound-placement">/);
  assert.match(placementSeo, /No warranty/);
});

test("calculator page wires Individual vs Professional columns that match the row template", () => {
  assert.match(markup, /id="planCompare"/);
  assert.match(markup, /id="planVerdict"/);
  assert.match(markup, /id="individualPerUnit"/);
  const planMarkup = markup.split('id="planCompare"')[0];
  const headerBlock = planMarkup.slice(planMarkup.lastIndexOf("<thead>"));
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  assert.deepEqual(headers, ["Account", "Fee / unit", "Profit", "Max buy"]);
  assert.match(scriptSource, /compareSellerPlans/);
  assert.match(scriptSource, /compareSellerPlanVolumes/);
  assert.match(scriptSource, /seller_plan_compared/);
  assert.match(markup, /id="planVolumeCompare"/);
  assert.match(scriptSource, /money\(path\.profit\)/);
  assert.match(scriptSource, /money\(path\.breakEvenBuyCost\)/);
  assert.match(html, /individual-vs-professional\.html/);
});

test("SEO page uses the same seller-plan worked example the tests lock", () => {
  const compared = compareSellerPlans({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
  });
  assert.match(planSeo, /40\.4 units a month/);
  assert.match(planSeo, /\$10\.99/);
  assert.match(planSeo, /\$10\.50/);
  assert.match(planSeo, /\$0\.49/);
  assert.match(planSeo, /\$39\.21/);
  assert.match(planSeo, /\$7\.49/);
  assert.match(planSeo, /volume ladder/);
  assert.match(planSeo, /Individual \+\$3\.01/);
  assert.match(planSeo, /Professional \+\$0\.79/);
  assert.match(planSeo, /href="\.\/"/);
  assert.match(planSeo, /No warranty/);
  assert.match(planSeo, /no SLA/);
  assert.match(planSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  nearEnough(compared.professional.selected.profit, 10.99);
  nearEnough(compared.individual.selected.profit, 10.5);
  nearEnough(compared.profitDelta, 0.49);
  nearEnough(compared.monthlyProfitDelta, 39.21);
});

test("named sourcing scenarios stay on this device", () => {
  assert.match(html, /id="saveScenario"/);
  assert.match(html, /id="scenarioName"/);
  assert.match(html, /id="copySummary"/);
  assert.match(html, /from "\.\/scenarios\.mjs"/);
  assert.match(html, /scenario_saved/);
  assert.match(html, /decision_summary_copied/);
});

test("pages keep the disclaimer and optional sponsor link", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(couponSeo, /No warranty/);
  assert.match(couponSeo, /Best-effort hosting, no SLA/);
  assert.match(couponSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(snsSeo, /No warranty/);
  assert.match(snsSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(bulkSeo, /No warranty/);
  assert.match(bulkSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(prepSeo, /No warranty/);
  assert.match(prepSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(placementSeo, /No warranty/);
  assert.match(placementSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(planSeo, /No warranty/);
  assert.match(planSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(packSeo, /No warranty/);
  assert.match(packSeo, /Best-effort hosting, no SLA/);
  assert.match(packSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(sfpSeo, /No warranty/);
  assert.match(sfpSeo, /Best-effort hosting, no SLA/);
  assert.match(sfpSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(awdSeo, /No warranty/);
  assert.match(awdSeo, /Best-effort hosting, no SLA/);
  assert.match(awdSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(narfSeo, /No warranty/);
  assert.match(narfSeo, /Best-effort hosting, no SLA/);
  assert.match(narfSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(acosSeo, /No warranty/);
  assert.match(acosSeo, /Best-effort hosting, no SLA/);
  assert.match(acosSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(vsAmazonSeo, /No warranty/);
  assert.match(vsAmazonSeo, /Best-effort hosting, no SLA/);
  assert.match(vsAmazonSeo, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("the incumbent-comparison page links back, names the incumbent honestly, and gives no unverifiable Amazon numbers", () => {
  assert.match(html, /vs-amazon-revenue-calculator\.html/);
  assert.match(vsAmazonSeo, /<a href="\.\/">/);
  // Names Amazon's own tool and links to Amazon's own domain so a reader can
  // check the source directly -- this page must never claim a number for
  // Amazon's calculator that only Amazon's own live schedule could confirm.
  assert.match(vsAmazonSeo, /sellercentral\.amazon\.com/);
  assert.match(vsAmazonSeo, /sell\.amazon\.com/);
  assert.doesNotMatch(vsAmazonSeo, /Amazon('s)? (charges|fee is|costs?) \$/i);
  assert.match(vsAmazonSeo, /not affiliated with, endorsed by, or sponsored by Amazon/i);
  assert.match(vsAmazonSeo, /trademarks of Amazon\.com/i);
});

test("max buy cost display says so when the listing already loses money at $0 cost", () => {
  // Regression: the display used to show a bare $0.00 for both "you can pay
  // up to $0 and break even" and "you lose money before buying a unit at
  // all" -- the same figure for two opposite facts. It now reads the signed
  // ceiling to tell them apart.
  assert.match(scriptSource, /breakEvenBuyCostRaw < 0/);
  assert.match(scriptSource, /loses money even at \$0 cost/);
});

test("calculator page classifies the typed buy cost against the zero-profit ceiling", () => {
  assert.match(html, /id="buyCostStatus"/);
  assert.match(scriptSource, /buyCostCheck/);
  assert.match(scriptSource, /sourcing_check_used/);
});
