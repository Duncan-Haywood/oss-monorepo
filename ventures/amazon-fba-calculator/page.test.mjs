// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareCoupons } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const seo = readFileSync(new URL("./does-this-amazon-coupon-still-pay.html", import.meta.url), "utf8");

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

test("schema.org featureList names the coupon comparison the page actually renders", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "featureList missing");
  assert.match(featureList[1], /coupon vs list profit/i);
  assert.match(markup, /id="couponCompare"/);
  assert.match(markup, /id="couponPercent"/);
  assert.match(markup, /does-this-amazon-coupon-still-pay\.html/);
});

test("SEO page uses the same worked example the tests lock", () => {
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
  assert.match(seo, /\$25\.49/);
  assert.match(seo, /\$6\.57/);
  assert.match(seo, /\$4\.42/);
  assert.match(seo, /67% lift/);
  assert.match(seo, /\$10\.99/);
  assert.ok(comparison.typed.profit > 6.56 && comparison.typed.profit < 6.58);
});

test("pages keep the disclaimer and optional sponsor link", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /Best-effort hosting, no SLA/);
  assert.match(seo, /github\.com\/sponsors\/Duncan-Haywood/);
});
