import test from "node:test";
import assert from "node:assert/strict";
import { decodeInputs, encodeInputs, ENUM_FIELDS, FIELD_IDS, RETAILER_FIELD_IDS } from "./share.mjs";

test("round-trips a full brand set including region and payout", () => {
  const inputs = {
    unitWholesale: 20,
    quantity: 10,
    unitCogs: 8,
    openingDiscountRate: 0,
    shippingReimbursement: 15,
    shippingCost: 15,
    otherCost: 0,
    promotedRate: 0,
    commissionRate: 15,
    firstOrderFlat: 10,
    firstOrderExtraRate: 0,
    paymentRate: 1.9,
    paymentFixed: 0.3,
    targetMargin: 40,
    expectedReorders: 2,
    annualCarryRate: 24,
    openHouseDiscountRate: 20,
    openHouseCommissionRate: 0,
    openHouseExtraRetailers: 2,
    organicFirstOrders: 4,
    extraPromotedOrders: 1,
    campaignPromotedRate: 15,
    attributedOrganicPct: 40,
    returnUnits: 10,
    returnLabel: 18,
    restockablePct: 80,
    keepDiscountPct: 20,
    denyKeepPct: 50,
    payNowRate: 2,
    payNowTakePct: 40,
    extraPayNowOrders: 0,
    netWaitDays: 60,
    payNowWaitDays: 60,
    region: "outside_na",
    payout: "next_day",
  };
  assert.deepEqual(decodeInputs(encodeInputs(inputs)), inputs);
});

test("emits fields in a stable order so the same inputs give the same link", () => {
  const a = encodeInputs({ otherCost: 1, unitWholesale: 20, region: "north_america" });
  const b = encodeInputs({ unitWholesale: 20, otherCost: 1, region: "north_america" });
  assert.equal(a, b);
  assert.equal(a, "unitWholesale=20&otherCost=1&region=north_america");
});

test("drops blank, negative, and unknown values instead of encoding them", () => {
  const encoded = encodeInputs({
    unitWholesale: 20,
    shippingCost: "",
    unitCogs: -1,
    paymentRate: "nope",
    evil: 999,
    region: "europe",
    payout: "day_60",
  });
  assert.equal(encoded, "unitWholesale=20&payout=day_60");
});

test("ignores unknown keys so a link can only ever set known fields", () => {
  assert.deepEqual(decodeInputs("unitWholesale=20&evil=999&script=alert(1)"), { unitWholesale: 20 });
});

test("tolerates a leading ? or # so location.hash/search can be passed directly", () => {
  assert.deepEqual(decodeInputs("#unitWholesale=20&region=outside_na"), {
    unitWholesale: 20,
    region: "outside_na",
  });
  assert.deepEqual(decodeInputs("?unitWholesale=20"), { unitWholesale: 20 });
});

test("returns an empty object for missing or malformed input", () => {
  assert.deepEqual(decodeInputs(""), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
});

test("every brand and retailer field id is unique", () => {
  assert.equal(new Set(FIELD_IDS).size, FIELD_IDS.length);
  assert.equal(new Set(RETAILER_FIELD_IDS).size, RETAILER_FIELD_IDS.length);
  assert.ok(FIELD_IDS.includes("unitWholesale"));
  assert.ok(FIELD_IDS.includes("expectedReorders"));
  assert.ok(FIELD_IDS.includes("annualCarryRate"));
  assert.ok(FIELD_IDS.includes("openHouseDiscountRate"));
  assert.ok(FIELD_IDS.includes("openHouseExtraRetailers"));
  assert.ok(FIELD_IDS.includes("campaignPromotedRate"));
  assert.ok(FIELD_IDS.includes("extraPromotedOrders"));
  assert.ok(FIELD_IDS.includes("attributedOrganicPct"));
  assert.ok(FIELD_IDS.includes("returnUnits"));
  assert.ok(FIELD_IDS.includes("keepDiscountPct"));
  assert.ok(FIELD_IDS.includes("payNowRate"));
  assert.ok(FIELD_IDS.includes("extraPayNowOrders"));
  assert.ok(FIELD_IDS.includes("payNowWaitDays"));
  assert.ok(RETAILER_FIELD_IDS.includes("unitRetail"));
  assert.deepEqual(Object.keys(ENUM_FIELDS), ["region", "payout"]);
});

test("retailer encode skips brand-only enums", () => {
  const encoded = encodeInputs(
    { unitWholesale: 18, unitRetail: 42, region: "north_america" },
    RETAILER_FIELD_IDS,
    false,
  );
  assert.equal(encoded, "unitWholesale=18&unitRetail=42");
});
