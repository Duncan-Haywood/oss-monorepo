// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareCoupons, compareMcf, compareSubscribeSave } from "./calc.mjs";

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
  assert.match(markup, /id="couponCompare"/);
  assert.match(markup, /id="couponPercent"/);
  assert.match(markup, /id="snsCompare"/);
  assert.match(markup, /does-this-amazon-coupon-still-pay\.html/);
  assert.match(markup, /does-subscribe-and-save-still-pay\.html/);
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

test("pages keep the disclaimer and optional sponsor link", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(couponSeo, /No warranty/);
  assert.match(couponSeo, /Best-effort hosting, no SLA/);
  assert.match(couponSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(snsSeo, /No warranty/);
  assert.match(snsSeo, /github\.com\/sponsors\/Duncan-Haywood/);
});
