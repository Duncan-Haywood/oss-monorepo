import test from "node:test";
import assert from "node:assert/strict";
import { parcelDuty, parcelVsBulk, euBasketForShare } from "./parcel.mjs";

const b = { product: "tee-cotton", parcelValue: 40 };

test("EU parcel under 150 with IOSS: flat 3 per category (hand: 2 categories = 6, 15% of 40)", () => {
  const r = parcelDuty({ ...b, destination: "EU", ioss: true, categories: 2 });
  assert.equal(r.duty, 6); assert.equal(r.shareOfGoodsPct, 15);
});
test("EU parcel under 150 without IOSS carries no flat duty and a warning", () => {
  const r = parcelDuty({ ...b, destination: "EU" });
  assert.equal(r.duty, 0); assert.ok(r.notes.length);
});
test("EU parcel at 150 or more pays the ordinary 12% on goods plus shipping (hand: 12% of 170 = 20.40)", () => {
  const r = parcelDuty({ ...b, destination: "EU", parcelValue: 150, shipping: 20, ioss: true });
  assert.equal(r.customsValue, 170); assert.equal(r.duty, 20.4);
});
test("US has no threshold: 16.5% of 40 = 6.60, plus broker fee 5", () => {
  const r = parcelDuty({ ...b, destination: "US", brokerFee: 5 });
  assert.equal(r.duty, 6.6); assert.equal(r.totalAtBorder, 11.6);
  assert.equal(parcelDuty({ ...b, destination: "US", extraTariffPct: 10 }).duty, 10.6);
});
test("UK: no duty at 135 or under, ordinary 12% above (hand: 12% of 200 = 24)", () => {
  assert.equal(parcelDuty({ ...b, destination: "UK", parcelValue: 135 }).duty, 0);
  assert.equal(parcelDuty({ ...b, destination: "UK", parcelValue: 200 }).duty, 24);
});
test("bad input returns an error, not NaN", () => {
  assert.ok(parcelDuty({ ...b, destination: "XX" }).error);
  assert.ok(parcelDuty({ product: "nope", destination: "US", parcelValue: 5 }).error);
  assert.ok(parcelDuty({ ...b, destination: "US", parcelValue: 0 }).error);
});
test("parcel versus bulk and basket size", () => {
  assert.equal(parcelVsBulk({ ...b, destination: "US" }, 0.8).extraPerParcel, 5.8);
  assert.equal(euBasketForShare(3, 1, 5), 60);
});
