import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeInputs, encodeInputs } from './share.mjs';
import { INPUT_FIELDS } from './calc.mjs';

// A shared link is only useful if it carries the whole order. When the encoder
// kept its own field list it fell behind calc.mjs twice (batch quantity, then
// target margin), so a link sent for a 10-unit batch opened as a single unit
// for the recipient — same URL, different profit. Round-trip every field the
// calculator accepts rather than a copy of the list that can go stale.
test('round-trips every field the calculator accepts', () => {
  const order = Object.fromEntries(INPUT_FIELDS.map((field, index) => [field, index + 1]));
  assert.deepEqual(decodeInputs(encodeInputs(order)), order);
});

test('carries batch quantity and target margin', () => {
  const restored = decodeInputs(encodeInputs({ price: 40, quantity: 10, targetMargin: 25, targetRoi: 50 }));
  assert.equal(restored.quantity, 10);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.targetRoi, 50);
});

test('carries expected return-rate fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40, returnRatePercent: 12, returnShippingCost: 7.5, feeRefundOnReturnPercent: 80,
  }));
  assert.equal(restored.returnRatePercent, 12);
  assert.equal(restored.returnShippingCost, 7.5);
  assert.equal(restored.feeRefundOnReturnPercent, 80);
});

test('carries auction vs Buy It Now fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    auctionExpectedClose: 36,
    binSellThroughPct: 50,
    auctionSellThroughPct: 90,
    binDaysToSell: 21,
    auctionDays: 7,
    binInsertionFee: 0.35,
    auctionInsertionFee: 0.35,
    auctionPromotedRate: 2,
  }));
  assert.equal(restored.auctionExpectedClose, 36);
  assert.equal(restored.binSellThroughPct, 50);
  assert.equal(restored.auctionSellThroughPct, 90);
  assert.equal(restored.binDaysToSell, 21);
  assert.equal(restored.auctionDays, 7);
  assert.equal(restored.binInsertionFee, 0.35);
  assert.equal(restored.auctionInsertionFee, 0.35);
  assert.equal(restored.auctionPromotedRate, 2);
});

test('carries partial-refund fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40, partialRefundAmount: 15, monthlyCases: 4,
  }));
  assert.equal(restored.partialRefundAmount, 15);
  assert.equal(restored.monthlyCases, 4);
});

test('carries Authenticity Guarantee fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    authenticityFeeRate: 3,
    authenticityExtraShip: 8,
    withoutAgSellThroughPct: 55,
    authenticitySellThroughPct: 80,
    authenticityReturnRatePercent: 4,
    monthlyAgListings: 8,
  }));
  assert.equal(restored.authenticityFeeRate, 3);
  assert.equal(restored.authenticityExtraShip, 8);
  assert.equal(restored.withoutAgSellThroughPct, 55);
  assert.equal(restored.authenticitySellThroughPct, 80);
  assert.equal(restored.authenticityReturnRatePercent, 4);
  assert.equal(restored.monthlyAgListings, 8);
});

test('carries local-pickup fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    shipSellThroughPct: 70,
    pickupSellThroughPct: 35,
    pickupNoShowPct: 20,
    pickupMinutes: 25,
    pickupHourlyWage: 18,
    pickupFeeCharged: 0,
    pickupPackagingCost: 1,
    pickupReturnRatePercent: 2,
    monthlyPickupListings: 8,
  }));
  assert.equal(restored.shipSellThroughPct, 70);
  assert.equal(restored.pickupSellThroughPct, 35);
  assert.equal(restored.pickupNoShowPct, 20);
  assert.equal(restored.pickupMinutes, 25);
  assert.equal(restored.pickupHourlyWage, 18);
  assert.equal(restored.pickupPackagingCost, 1);
  assert.equal(restored.pickupReturnRatePercent, 2);
  assert.equal(restored.monthlyPickupListings, 8);
});

test('carries lot-versus-singles fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    lotPieceCount: 5,
    singleExpectedPrice: 14,
    lotSellThroughPct: 80,
    singleSellThroughPct: 55,
    lotInsertionFee: 0,
    singleInsertionFee: 0.35,
    singleShippingCharged: 5,
    singleShippingCost: 4,
    singlePackagingCost: 1,
    lotListingMinutes: 8,
    singleListingMinutes: 8,
    lotListingWage: 18,
    monthlyLotDecisions: 6,
  }));
  assert.equal(restored.lotPieceCount, 5);
  assert.equal(restored.singleExpectedPrice, 14);
  assert.equal(restored.lotSellThroughPct, 80);
  assert.equal(restored.singleSellThroughPct, 55);
  assert.equal(restored.singleInsertionFee, 0.35);
  assert.equal(restored.singleShippingCost, 4);
  assert.equal(restored.lotListingMinutes, 8);
  assert.equal(restored.lotListingWage, 18);
  assert.equal(restored.monthlyLotDecisions, 6);
});

test('carries Standard Envelope fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    envelopeShippingCost: 0.66,
    envelopePackagingCost: 0.35,
    envelopeClaimRatePercent: 8,
    envelopeFeeRefundOnClaimPercent: 100,
    trackedSellThroughPct: 90,
    envelopeSellThroughPct: 85,
    monthlyEnvelopeListings: 40,
  }));
  assert.equal(restored.envelopeShippingCost, 0.66);
  assert.equal(restored.envelopePackagingCost, 0.35);
  assert.equal(restored.envelopeClaimRatePercent, 8);
  assert.equal(restored.envelopeFeeRefundOnClaimPercent, 100);
  assert.equal(restored.trackedSellThroughPct, 90);
  assert.equal(restored.envelopeSellThroughPct, 85);
  assert.equal(restored.monthlyEnvelopeListings, 40);
});

test('carries combined-shipping fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    combinedItemCount: 2,
    combinedShippingCharged: 8,
    combinedShippingCost: 6.5,
    combinedPackagingCost: 1.25,
    combinedReturnShippingCost: 6.5,
    combinedFixedFee: 0.3,
    combinedReturnRatePercent: 10,
    monthlyCombinedOrders: 12,
  }));
  assert.equal(restored.combinedItemCount, 2);
  assert.equal(restored.combinedShippingCharged, 8);
  assert.equal(restored.combinedShippingCost, 6.5);
  assert.equal(restored.combinedPackagingCost, 1.25);
  assert.equal(restored.combinedReturnShippingCost, 6.5);
  assert.equal(restored.combinedFixedFee, 0.3);
  assert.equal(restored.combinedReturnRatePercent, 10);
  assert.equal(restored.monthlyCombinedOrders, 12);
});

test('carries seller-initiated-offer fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    offerPercent: 10,
    waitSellThroughPct: 40,
    offerAcceptPct: 55,
    monthlyOffers: 40,
  }));
  assert.equal(restored.offerPercent, 10);
  assert.equal(restored.waitSellThroughPct, 40);
  assert.equal(restored.offerAcceptPct, 55);
  assert.equal(restored.monthlyOffers, 40);
});

test('carries Promoted Offsite fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    offsiteSpend: 20,
    offsiteExtraOrders: 2,
    offsitePromotedRate: 8,
    monthlyOffsiteCampaigns: 4,
  }));
  assert.equal(restored.offsiteSpend, 20);
  assert.equal(restored.offsiteExtraOrders, 2);
  assert.equal(restored.offsitePromotedRate, 8);
  assert.equal(restored.monthlyOffsiteCampaigns, 4);
});

test('carries Promoted Listings Standard fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    promotedStandardRate: 5,
    promotedStandardExtraOrders: 1,
    monthlyPromotedListings: 20,
  }));
  assert.equal(restored.promotedStandardRate, 5);
  assert.equal(restored.promotedStandardExtraOrders, 1);
  assert.equal(restored.monthlyPromotedListings, 20);
});

test('carries Promoted Listings Advanced fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    advancedCpc: 0.4,
    advancedClicks: 40,
    advancedExtraOrders: 1,
    advancedPromotedRate: 5,
    monthlyAdvancedCampaigns: 20,
  }));
  assert.equal(restored.advancedCpc, 0.4);
  assert.equal(restored.advancedClicks, 40);
  assert.equal(restored.advancedExtraOrders, 1);
  assert.equal(restored.advancedPromotedRate, 5);
  assert.equal(restored.monthlyAdvancedCampaigns, 20);
});

test('carries quantity-discount fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    qtyDiscountUnits: 2,
    qtyDiscountPercent: 10,
    qtyShippingCharged: 6,
    qtyShippingCost: 5.5,
    qtyPackagingCost: 1.25,
    qtyReturnShippingCost: 5.5,
    qtyFixedFee: 0.3,
    qtyReturnRatePercent: 10,
    singlesSellThroughPct: 55,
    qtyTakePct: 70,
    monthlyQtyOrders: 20,
  }));
  assert.equal(restored.qtyDiscountUnits, 2);
  assert.equal(restored.qtyDiscountPercent, 10);
  assert.equal(restored.qtyShippingCharged, 6);
  assert.equal(restored.qtyShippingCost, 5.5);
  assert.equal(restored.qtyPackagingCost, 1.25);
  assert.equal(restored.qtyReturnShippingCost, 5.5);
  assert.equal(restored.qtyFixedFee, 0.3);
  assert.equal(restored.qtyReturnRatePercent, 10);
  assert.equal(restored.singlesSellThroughPct, 55);
  assert.equal(restored.qtyTakePct, 70);
  assert.equal(restored.monthlyQtyOrders, 20);
});

test('carries immediate-payment fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    unpaidRatePercent: 8,
    laterSellThroughPct: 55,
    immediateSellThroughPct: 45,
    unpaidRelistFee: 0.35,
    unpaidMinutes: 20,
    unpaidHourlyWage: 18,
    monthlyImmediateListings: 40,
  }));
  assert.equal(restored.unpaidRatePercent, 8);
  assert.equal(restored.laterSellThroughPct, 55);
  assert.equal(restored.immediateSellThroughPct, 45);
  assert.equal(restored.unpaidRelistFee, 0.35);
  assert.equal(restored.unpaidMinutes, 20);
  assert.equal(restored.unpaidHourlyWage, 18);
  assert.equal(restored.monthlyImmediateListings, 40);
});

test('carries Global Shipping fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    gspReturnRatePercent: 6,
    gspSellThroughPct: 40,
    selfShipShippingCharged: 22,
    selfShipShippingCost: 18,
    selfShipReturnShippingCost: 18,
    selfShipIntlFeeRate: 1.65,
    selfShipReturnRatePercent: 10,
    selfShipClaimRatePercent: 8,
    selfShipSellThroughPct: 55,
    monthlyGspListings: 20,
  }));
  assert.equal(restored.gspReturnRatePercent, 6);
  assert.equal(restored.gspSellThroughPct, 40);
  assert.equal(restored.selfShipShippingCharged, 22);
  assert.equal(restored.selfShipShippingCost, 18);
  assert.equal(restored.selfShipReturnShippingCost, 18);
  assert.equal(restored.selfShipIntlFeeRate, 1.65);
  assert.equal(restored.selfShipReturnRatePercent, 10);
  assert.equal(restored.selfShipClaimRatePercent, 8);
  assert.equal(restored.selfShipSellThroughPct, 55);
  assert.equal(restored.monthlyGspListings, 20);
});

test('carries seller-coupon fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    couponPercent: 15,
    couponRedeemPct: 40,
    listedSellThroughPct: 40,
    couponSellThroughPct: 55,
    dropSellThroughPct: 50,
    monthlyCouponListings: 40,
  }));
  assert.equal(restored.couponPercent, 15);
  assert.equal(restored.couponRedeemPct, 40);
  assert.equal(restored.listedSellThroughPct, 40);
  assert.equal(restored.couponSellThroughPct, 55);
  assert.equal(restored.dropSellThroughPct, 50);
  assert.equal(restored.monthlyCouponListings, 40);
});

test('carries Top Rated Plus fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    trsDiscountPct: 10,
    standardSellThroughPct: 60,
    trsSellThroughPct: 75,
    standardReturnRatePercent: 8,
    trsReturnRatePercent: 16,
    standardReturnShippingCost: 0,
    trsReturnShippingCost: 5,
    trsHandlingMinutes: 8,
    trsHandlingWage: 18,
    monthlyTrsListings: 40,
  }));
  assert.equal(restored.trsDiscountPct, 10);
  assert.equal(restored.standardSellThroughPct, 60);
  assert.equal(restored.trsSellThroughPct, 75);
  assert.equal(restored.standardReturnRatePercent, 8);
  assert.equal(restored.trsReturnRatePercent, 16);
  assert.equal(restored.standardReturnShippingCost, 0);
  assert.equal(restored.trsReturnShippingCost, 5);
  assert.equal(restored.trsHandlingMinutes, 8);
  assert.equal(restored.trsHandlingWage, 18);
  assert.equal(restored.monthlyTrsListings, 40);
});

test('carries Managed Returns fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    selfReturnShippingCost: 8,
    selfReturnRatePercent: 10,
    managedReturnFee: 5.5,
    managedReturnRatePercent: 14,
    buyerPaysReturnRatePercent: 6,
    monthlyManagedListings: 40,
  }));
  assert.equal(restored.selfReturnShippingCost, 8);
  assert.equal(restored.selfReturnRatePercent, 10);
  assert.equal(restored.managedReturnFee, 5.5);
  assert.equal(restored.managedReturnRatePercent, 14);
  assert.equal(restored.buyerPaysReturnRatePercent, 6);
  assert.equal(restored.monthlyManagedListings, 40);
});

test('carries store-subscription fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    monthlyStoreOrders: 80,
    monthlyStoreFee: 7.95,
  }));
  assert.equal(restored.monthlyStoreOrders, 80);
  assert.equal(restored.monthlyStoreFee, 7.95);
});

test('carries the extra international label cost', () => {
  const restored = decodeInputs(encodeInputs({ price: 40, intlExtraShipping: 18.5 }));
  assert.equal(restored.intlExtraShipping, 18.5);
});

test('carries package-protection fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    skipClaimRatePercent: 8,
    insurancePremium: 2.25,
    insuranceClaimRatePercent: 0.5,
    insurancePayout: 20,
    signatureFee: 4,
    signatureClaimRatePercent: 0.3,
    monthlyProtectionShipments: 25,
  }));
  assert.equal(restored.skipClaimRatePercent, 8);
  assert.equal(restored.insurancePremium, 2.25);
  assert.equal(restored.insuranceClaimRatePercent, 0.5);
  assert.equal(restored.insurancePayout, 20);
  assert.equal(restored.signatureFee, 4);
  assert.equal(restored.signatureClaimRatePercent, 0.3);
  assert.equal(restored.monthlyProtectionShipments, 25);
});

test('carries eBay-label vs third-party fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    ebayLabelCost: 5.4,
    thirdPartyLabelCost: 4.1,
    ebayLabelClaimRatePercent: 0.7,
    thirdPartyClaimRatePercent: 3,
    labelUploadMinutes: 3,
    labelUploadWage: 20,
    monthlyLabelShipments: 25,
  }));
  assert.equal(restored.ebayLabelCost, 5.4);
  assert.equal(restored.thirdPartyLabelCost, 4.1);
  assert.equal(restored.ebayLabelClaimRatePercent, 0.7);
  assert.equal(restored.thirdPartyClaimRatePercent, 3);
  assert.equal(restored.labelUploadMinutes, 3);
  assert.equal(restored.labelUploadWage, 20);
  assert.equal(restored.monthlyLabelShipments, 25);
});

test('carries free-shipping fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    freeShipPrice: 46,
    buyerPaysSellThroughPct: 55,
    freeShipSellThroughPct: 70,
    monthlyFreeShipListings: 40,
  }));
  assert.equal(restored.freeShipPrice, 46);
  assert.equal(restored.buyerPaysSellThroughPct, 55);
  assert.equal(restored.freeShipSellThroughPct, 70);
  assert.equal(restored.monthlyFreeShipListings, 40);
});

test('round-trips known numeric inputs in stable order', () => {
  const encoded = encodeInputs({ price: 40, shippingCharged: 6, finalValueRate: 13.6 });
  assert.equal(encoded, 'price=40&shippingCharged=6&finalValueRate=13.6');
  assert.deepEqual(decodeInputs(encoded), { price: 40, shippingCharged: 6, finalValueRate: 13.6 });
});

test('ignores unknown, negative, non-finite, and malformed values', () => {
  assert.deepEqual(decodeInputs('?price=10&costOfGoods=-2&bogus=4&shippingCost=nope'), { price: 10 });
  assert.equal(encodeInputs({ price: -1, shippingCost: Infinity, bogus: 3 }), '');
});

test('accepts hash links without arbitrary fields', () => {
  assert.deepEqual(decodeInputs('#price=22.5&otherCost=1&secret=abc'), { price: 22.5, otherCost: 1 });
});
