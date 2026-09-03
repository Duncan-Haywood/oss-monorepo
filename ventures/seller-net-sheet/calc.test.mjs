import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommissionPreset,
  calculateNetSheet,
  COMMISSION_PRESETS,
  compareOffers,
  estimateTaxProration,
  formatNetSheetSummary,
  formatOfferComparison,
  salePriceForTargetNet,
} from "./calc.mjs";

const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

const shared = {
  loanPayoff: 280000,
  listingRate: 2.5,
  listingFlat: 0,
  buyerBrokerRate: 2.5,
  buyerBrokerFlat: 0,
  concessionRate: 0,
  concessionFlat: 0,
  titleRate: 0,
  titleFlat: 2400,
  transferTaxRate: 0.11,
  transferTaxFlat: 0,
  recording: 125,
  hoaFees: 350,
  homeWarranty: 550,
  repairsCredits: 0,
  taxProration: 800,
  otherClosing: 0,
  prepCash: 0,
};

test("estimates a day-count tax proration without claiming local custom", () => {
  near(estimateTaxProration({ annualTax: 3650, daysChargedToSeller: 73 }), 730, "73/365 of $3650");
});

test("rejects unknown commission presets", () => {
  assert.throws(() => applyCommissionPreset({}, "mystery"), /Unknown commission preset/);
});

test("applies a listing-only preset without inventing buyer-broker pay", () => {
  const filled = applyCommissionPreset({}, "listing_only");
  assert.equal(filled.listingRate, 2.5);
  assert.equal(filled.buyerBrokerRate, 0);
  assert.equal(COMMISSION_PRESETS.flat_listing.listingFlat, 4000);
});

test("computes net proceeds with listing, buyer-broker, and flat closing costs", () => {
  const r = calculateNetSheet({ ...shared, salePrice: 425000 });
  const listing = 425000 * 0.025;
  const buyer = 425000 * 0.025;
  const transfer = 425000 * 0.0011;
  const selling = listing + buyer + 2400 + transfer + 125 + 350 + 550 + 800;
  near(r.items.listing.amount, listing, "listing");
  near(r.items.buyerBroker.amount, buyer, "buyer-broker");
  near(r.sellingCosts, selling, "selling costs");
  near(r.net, 425000 - 280000 - selling, "net");
  near(r.costOfSaleRate, (selling / 425000) * 100, "cost of sale %");
});

test("treats buyer-broker compensation as optional, not an automatic split", () => {
  const withOffer = calculateNetSheet({ ...shared, salePrice: 425000 });
  const without = calculateNetSheet({ ...shared, salePrice: 425000, buyerBrokerRate: 0 });
  near(without.net - withOffer.net, 425000 * 0.025, "dropping buyer-broker adds that cash");
});

test("solves for the sale price that hits a target net", () => {
  const target = 120000;
  const solved = salePriceForTargetNet({ ...shared, targetNet: target });
  assert.equal(solved.reachable, true);
  const check = calculateNetSheet({ ...shared, salePrice: solved.salePrice });
  near(check.net, target, "round-trip target net");
});

test("marks a target unreachable when percentage costs consume the whole price", () => {
  const solved = salePriceForTargetNet({
    ...shared,
    listingRate: 50,
    buyerBrokerRate: 50,
    targetNet: 1,
  });
  assert.equal(solved.reachable, false);
  assert.equal(solved.salePrice, Infinity);
});

test("a cleaner lower offer can net more than a higher offer with concessions", () => {
  const comparison = compareOffers(
    shared,
    { salePrice: 425000, buyerBrokerRate: 2.5, concessionFlat: 8000 },
    { salePrice: 417000, buyerBrokerRate: 0, concessionFlat: 0 },
  );
  assert.equal(comparison.better, "b");
  assert.ok(comparison.a.salePrice > comparison.b.salePrice, "A is the higher price");
  assert.ok(comparison.b.net > comparison.a.net, "B leaves more cash");
  assert.ok(comparison.delta < 0);
});

test("tied offers report a tie", () => {
  const comparison = compareOffers(
    shared,
    { salePrice: 400000, buyerBrokerRate: 0 },
    { salePrice: 400000, buyerBrokerRate: 0 },
  );
  assert.equal(comparison.better, "tie");
  near(comparison.delta, 0, "zero delta");
});

test("rejects non-numeric sale prices", () => {
  assert.throws(() => calculateNetSheet({ salePrice: "abc" }), /Sale price must be a number/);
});

test("rejects a negative loan payoff", () => {
  assert.throws(
    () => calculateNetSheet({ salePrice: 100000, loanPayoff: -1 }),
    /Loan payoff must be at least 0/,
  );
});

test("formats a copyable worksheet without inventing a recommended price", () => {
  const result = calculateNetSheet({ ...shared, salePrice: 425000, targetNet: 120000 });
  const text = formatNetSheetSummary(result, { offerLabel: "Offer A" });
  assert.match(text, /SELLER NET SHEET — Offer A/);
  assert.match(text, /NET TO SELLER/);
  assert.match(text, /Draft worksheet only/);
  assert.doesNotMatch(text, /you should accept/i);
  assert.doesNotMatch(text, /you are required/i);
});

test("formats an offer comparison that names the cash gap, not a recommendation", () => {
  const comparison = compareOffers(
    shared,
    { salePrice: 425000, buyerBrokerRate: 2.5 },
    { salePrice: 417000, buyerBrokerRate: 0 },
  );
  const text = formatOfferComparison(comparison);
  assert.match(text, /OFFER COMPARISON/);
  assert.match(text, /Offer B nets/);
  assert.match(text, /higher offer is not always more cash/i);
  assert.doesNotMatch(text, /accept offer/i);
});

test("does not claim a winning offer has 'extra concessions' it does not have", () => {
  // Offer A: higher price AND lower costs than B (0% commission vs. 6%).
  // The old price-direction heuristic said "the extra price more than
  // covers its extra concessions" here, inventing concessions A never made.
  const comparison = compareOffers(
    { loanPayoff: 0 },
    { salePrice: 300000, listingRate: 0, buyerBrokerRate: 0 },
    { salePrice: 250000, listingRate: 6, buyerBrokerRate: 0 },
  );
  assert.equal(comparison.better, "a");
  const text = formatOfferComparison(comparison);
  assert.doesNotMatch(text, /extra concessions/i);
  assert.match(text, /Offer A nets \$65,000\.00 more, with a \$50,000\.00 higher price and \$15,000\.00 lower payoff and selling costs than Offer B\./);
});

test("offer comparison narrative matches net exactly: price gap minus cost gap", () => {
  const comparison = compareOffers(
    shared,
    { salePrice: 425000, buyerBrokerRate: 2.5, concessionFlat: 8000 },
    { salePrice: 417000, buyerBrokerRate: 0, concessionFlat: 0 },
  );
  const winner = comparison.better === "a" ? comparison.a : comparison.b;
  const loser = comparison.better === "a" ? comparison.b : comparison.a;
  const priceDiff = winner.salePrice - loser.salePrice;
  const deductionDiff = (winner.loanPayoff + winner.sellingCosts) - (loser.loanPayoff + loser.sellingCosts);
  near(winner.net - loser.net, priceDiff - deductionDiff, "net gap equals price gap minus cost gap");
  const text = formatOfferComparison(comparison);
  assert.match(text, /lower price/);
  assert.match(text, /lower payoff and selling costs/);
});
