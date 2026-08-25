import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateListing, compareHoldVsRemove } from "./calc.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, "index.html"), "utf8");
const seo = readFileSync(join(root, "aged-inventory-removal.html"), "utf8");
const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");

test("calculator exposes hold-vs-remove fields a seller can edit", () => {
  for (const id of [
    "remainingUnits",
    "expectedMonthsToSell",
    "agedStartsAfterMonths",
    "agedSurchargePerCuFt",
    "removalFeePerUnit",
    "salvagePerUnit",
    "holdHero",
    "holdScenarios",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /compareHoldVsRemove/);
  assert.match(html, /hold_vs_remove_compared/);
  assert.match(html, /aged-inventory-removal\.html/);
});

test("disclaimer is visible on the calculator and the SEO page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /not tax, financial, or business advice/i);
});

test("sitemap lists the aged-inventory page", () => {
  assert.match(sitemap, /aged-inventory-removal\.html/);
});

test("page defaults are a hold-wins leftover example a seller can read immediately", () => {
  const listing = calculateListing({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    monthsInStorage: 1,
    storageRate: 0.87,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    adsPerUnit: 0,
    otherCost: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
  });
  const decision = compareHoldVsRemove({
    remainingUnits: 20,
    expectedMonthsToSell: 3,
    monthsAlreadyStored: 1,
    agedStartsAfterMonths: 6,
    storageRate: 0.87,
    agedSurchargePerCuFt: 1.5,
    removalFeePerUnit: 1.04,
    salvagePerUnit: 0,
    cubicFeet: listing.cubicFeet,
    salePrice: listing.salePrice,
    referralRate: 15,
    fulfillmentFee: listing.fulfillmentFee,
    adsPerUnit: 0,
  });
  assert.equal(decision.betterPath, "hold");
  assert.equal(decision.surchargeMonths, 0);
  assert.ok(decision.holdAdvantage > 0);
});
