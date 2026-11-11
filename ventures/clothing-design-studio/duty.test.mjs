import test from "node:test";
import assert from "node:assert/strict";
import { landedByDestination, compareDestinations, freightBreakQty } from "./duty.mjs";

const base = { product: "tee-cotton", quantity: 100, factoryPrice: 5, freightTotal: 200, insuranceTotal: 0 };

test("US duty is on the factory price only, not freight (hand: 500 x 16.5% = 82.50)", () => {
  const r = landedByDestination({ ...base, destination: "US" });
  assert.equal(r.customsValue, 500);
  assert.equal(r.duty, 82.5);
  assert.equal(r.landedTotal, 782.5); // 500 + 200 + 82.5
  assert.equal(r.landedPerGarment, 7.83);
  assert.equal(r.importVat, 0);
});
test("EU duty is on goods plus freight and insurance; import VAT is on value plus duty", () => {
  const r = landedByDestination({ ...base, destination: "EU", insuranceTotal: 10 });
  assert.equal(r.customsValue, 710);          // 500 + 200 + 10
  assert.equal(r.duty, 85.2);                  // 12%
  assert.equal(r.importVat, 166.99);           // (710 + 85.2) x 21% = 166.992
  assert.equal(r.landedTotal, 795.2);          // import VAT excluded
  assert.equal(r.vatReclaimable, true);
});
test("synthetic hoodie into the US carries the higher 32% rate", () => {
  const r = landedByDestination({ ...base, product: "hoodie-synthetic", destination: "US" });
  assert.equal(r.ratePct, 32);
  assert.equal(r.duty, 160);
});
test("extra tariff adds to the rate and an override replaces the general rate", () => {
  const a = landedByDestination({ ...base, destination: "US", extraTariffPct: 20 });
  assert.equal(a.extraDuty, 100); assert.equal(a.landedTotal, 882.5);
  const b = landedByDestination({ ...base, destination: "US", rateOverridePct: 10 });
  assert.equal(b.duty, 50);
});
test("zero duty from Bangladesh into the EU and UK only with an origin proof, never into the US", () => {
  assert.equal(landedByDestination({ ...base, destination: "EU", origin: "Bangladesh" }).ratePct, 12);
  const eu = landedByDestination({ ...base, destination: "EU", origin: "Bangladesh", haveOriginProof: true });
  assert.equal(eu.ratePct, 0); assert.equal(eu.preference, true);
  assert.equal(landedByDestination({ ...base, destination: "US", origin: "Bangladesh", haveOriginProof: true }).ratePct, 16.5);
});
test("bad input returns an error, not NaN", () => {
  assert.ok(landedByDestination({ ...base, destination: "XX" }).error);
  assert.ok(landedByDestination({ ...base, destination: "US", quantity: 0 }).error);
  assert.ok(landedByDestination({ ...base, destination: "US", factoryPrice: "" }).error);
  assert.ok(landedByDestination({ ...base, product: "nope", destination: "US" }).error);
});
test("compareDestinations returns the three markets and freightBreakQty rounds up", () => {
  const rows = compareDestinations({ ...base, destination: "US" });
  assert.deepEqual(rows.map(r => r.destination), ["US", "EU", "UK"]);
  assert.equal(freightBreakQty(5, 200, 5), 800); // 200 / (5 x 0.05)
  assert.equal(freightBreakQty(0, 200), null);
});

import { productForDesign, dutyPctFor } from "./duty.mjs";
test("garment and fibre pick the duty heading", () => {
  assert.equal(productForDesign("tee", 0), "tee-cotton");
  assert.equal(productForDesign("longsleeve", 0.6), "tee-synthetic");
  assert.equal(productForDesign("hoodie", 0), "hoodie-cotton");
  assert.equal(productForDesign("crewneck", 1), "hoodie-synthetic");
  assert.equal(productForDesign("tee", 0.5), "tee-cotton"); // exactly half is not over half
});
test("studio duty percent: US is the rate; EU scales with freight (hand: (500+100)x12%/500 = 14.4%)", () => {
  assert.equal(dutyPctFor({ garmentId: "tee", polyesterShare: 0, destination: "US", factoryPrice: 5, freightPerGarment: 1 }), 16.5);
  assert.equal(dutyPctFor({ garmentId: "tee", polyesterShare: 0, destination: "EU", factoryPrice: 5, freightPerGarment: 1 }), 14.4);
});
test("studio duty percent: proved Bangladesh origin is 0 in the EU; extra US tariff adds on", () => {
  assert.equal(dutyPctFor({ garmentId: "tee", destination: "EU", origin: "Bangladesh", haveOriginProof: true, factoryPrice: 5 }), 0);
  assert.equal(dutyPctFor({ garmentId: "tee", destination: "US", extraTariffPct: 10, factoryPrice: 5 }), 26.5);
  assert.equal(dutyPctFor({ garmentId: "tee", destination: "US", factoryPrice: 0 }), null);
});

test("a garment or destination that is an Object key (constructor, toString) is refused with the plain message, not a TypeError", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    assert.deepEqual(landedByDestination({ ...base, product: name, destination: "US" }), { error: "Choose a garment type." }, name);
    assert.deepEqual(landedByDestination({ ...base, destination: name }), { error: "Choose a destination." }, name);
  }
});
