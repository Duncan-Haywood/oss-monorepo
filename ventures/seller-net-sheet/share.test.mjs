import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  NUMBER_FIELD_IDS,
  OFFER_A_FIELD_IDS,
  OFFER_B_FIELD_IDS,
  PRESET_FIELD_ID,
  PRESET_IDS,
  PRORATION_FIELD_IDS,
  SHARED_FIELD_IDS,
  decodeInputs,
  encodeInputs,
} from "./share.mjs";
import { COMMISSION_PRESETS, calculateNetSheet, compareOffers } from "./calc.mjs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// A worksheet with every field set to something other than its page default,
// so a dropped field shows up as a changed number rather than coincidentally
// matching what the recipient's page would have shown anyway.
const SENDER = Object.freeze({
  loanPayoff: 312500, listingRate: 2.25, listingFlat: 750, titleFlat: 1450,
  titleRate: 0.35, transferTaxRate: 0.6, transferTaxFlat: 120, recording: 195,
  hoaFees: 640, homeWarranty: 575, repairsCredits: 3200, taxProration: 2400,
  otherClosing: 810, prepCash: 1900,
  salePrice: 468000, buyerBrokerRate: 2.75, buyerBrokerFlat: 500,
  concessionRate: 1.25, concessionFlat: 1500, targetNet: 132000,
  bSalePrice: 479000, bBuyerBrokerRate: 3, bBuyerBrokerFlat: 900,
  bConcessionFlat: 8500,
  prorationAnnualTax: 10950, prorationDays: 80,
  preset: "six_percent_restated",
});

const pick = (source, ids) => Object.fromEntries(ids.map((id) => [id, source[id]]));
const readA = (state) => ({ ...pick(state, SHARED_FIELD_IDS), ...pick(state, OFFER_A_FIELD_IDS) });
const readB = (state) => ({
  salePrice: state.bSalePrice,
  buyerBrokerRate: state.bBuyerBrokerRate,
  buyerBrokerFlat: state.bBuyerBrokerFlat,
  concessionFlat: state.bConcessionFlat,
  concessionRate: 0,
});

test("every field the page reads rides in the link", () => {
  // The lists here and the ones in index.html must not drift: a field added
  // to the page but not to the link is exactly the silent drop this module
  // exists to prevent.
  for (const list of ["SHARED_IDS", "A_IDS", "B_IDS"]) {
    const declared = index.match(new RegExp(`const ${list} = \\[([^\\]]*)\\]`, "s"));
    assert.ok(declared, `index.html should declare ${list}`);
    const ids = [...declared[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, `${list} should name at least one field`);
    for (const id of ids) {
      assert.ok(NUMBER_FIELD_IDS.includes(id), `${id} is read by the page but dropped from the share link`);
    }
  }
});

test("a round trip preserves every value", () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
  assert.equal(decoded[PRESET_FIELD_ID], SENDER[PRESET_FIELD_ID]);
});

test("the recipient computes the same net the sender saw", () => {
  const sent = calculateNetSheet(readA(SENDER));
  const received = calculateNetSheet(readA(decodeInputs(encodeInputs(SENDER))));
  assert.equal(received.net, sent.net);
  assert.equal(received.sellingCosts, sent.sellingCosts);
  assert.equal(received.salePriceForTarget?.salePrice, sent.salePriceForTarget?.salePrice);
});

test("the recipient sees the same two-offer verdict", () => {
  // The point of this venture is that the higher price is not always the
  // higher net. A link that loses Offer B's concession would hand the
  // recipient the opposite conclusion.
  const state = decodeInputs(encodeInputs(SENDER));
  const sent = compareOffers(pick(SENDER, SHARED_FIELD_IDS), readA(SENDER), readB(SENDER));
  const received = compareOffers(pick(state, SHARED_FIELD_IDS), readA(state), readB(state));
  assert.equal(received.better, sent.better);
  assert.equal(received.delta, sent.delta);
});

test("dropping one Offer B field would change the verdict — so the guard above is load-bearing", () => {
  const withoutConcession = { ...SENDER, bConcessionFlat: 0 };
  const full = compareOffers(pick(SENDER, SHARED_FIELD_IDS), readA(SENDER), readB(SENDER));
  const lossy = compareOffers(
    pick(withoutConcession, SHARED_FIELD_IDS),
    readA(withoutConcession),
    readB(withoutConcession),
  );
  assert.notEqual(lossy.delta, full.delta);
});

test("the commission preset survives, and an unknown one is ignored rather than thrown", () => {
  assert.equal(decodeInputs("preset=listing_only").preset, "listing_only");
  assert.equal(decodeInputs("preset=not_a_preset").preset, undefined);
  assert.deepEqual(PRESET_IDS, Object.keys(COMMISSION_PRESETS));
});

test("blank fields are omitted so the recipient keeps the page default", () => {
  const encoded = encodeInputs({ salePrice: 400000, loanPayoff: "", titleFlat: null });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.salePrice, 400000);
  assert.ok(!("loanPayoff" in decoded));
  assert.ok(!("titleFlat" in decoded));
});

test("a truncated or hostile fragment opens the page instead of breaking it", () => {
  assert.deepEqual(decodeInputs(""), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs("#"), {});
  assert.deepEqual(decodeInputs("salePrice=abc&loanPayoff=-5"), {});
  assert.deepEqual(decodeInputs("__proto__=polluted&salePrice=1000"), { salePrice: 1000 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs("?salePrice=1000"), { salePrice: 1000 });
});

test("the visitor's usage-counting choice is never carried between devices", () => {
  assert.ok(!NUMBER_FIELD_IDS.includes("usageOptOut"));
  assert.ok(!("usageOptOut" in decodeInputs("usageOptOut=true&salePrice=1000")));
});

test("the estimator inputs travel with the proration they produced", () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of PRORATION_FIELD_IDS) assert.equal(decoded[id], SENDER[id]);
});

test("the page offers the link and reads one back on arrival", () => {
  assert.match(index, /import\s*\{[^}]*encodeInputs[^}]*\}\s*from\s*"\.\/share\.mjs"/);
  assert.match(index, /id="copyShareLink"/);
  assert.match(index, /window\.location\.hash/);
});

test("restoring a link never re-stamps the preset over the sender's own rates", () => {
  // applyPreset() overwrites listingRate, buyerBrokerRate and listingFlat.
  // Calling it while restoring would discard exactly the custom rates a
  // sender most wants a second opinion on.
  const restore = index.match(/function applyShared[\s\S]*?\n {4}\}/);
  assert.ok(restore, "index.html should have an applyShared restore function");
  assert.ok(!/applyPreset\(\)/.test(restore[0]), "restore must not call applyPreset()");
});
