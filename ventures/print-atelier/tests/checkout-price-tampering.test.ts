import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckoutSessionPayload,
  sanitizeCheckoutLineItems,
  type CheckoutLineItem,
} from "../src/lib/checkout.ts";
import { catalogArtworks } from "../src/lib/marketplace.ts";
import { sellableCatalog } from "./support/print-files.ts";

test("sanitizeCheckoutLineItems replaces client-tampered price with catalog price", () => {
  const midnight = catalogArtworks.find((art) => art.slug === "midnight-coast");
  assert.ok(midnight);

  const tamperedItem: CheckoutLineItem = {
    artworkSlug: midnight.slug,
    title: midnight.title,
    artistName: midnight.artistName,
    retailPrice: 1.0, // Client attempts to buy $150 print for $1
    fulfillmentCost: 0.0,
    quantity: 1,
  };

  const sanitized = sanitizeCheckoutLineItems([tamperedItem], catalogArtworks);

  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].retailPrice, midnight.retailPrice);
  assert.equal(sanitized[0].fulfillmentCost, midnight.fulfillmentCost);
  assert.notEqual(sanitized[0].retailPrice, 1.0);
});

test("buildCheckoutSessionPayload uses catalog price after sanitization", () => {
  const midnight = catalogArtworks.find((art) => art.slug === "midnight-coast");
  assert.ok(midnight);

  const tamperedItem: CheckoutLineItem = {
    artworkSlug: midnight.slug,
    title: midnight.title,
    artistName: midnight.artistName,
    retailPrice: 1.0,
    fulfillmentCost: 0.0,
    quantity: 1,
  };

  const sanitizedCart = sanitizeCheckoutLineItems([tamperedItem], catalogArtworks);
  const payload = buildCheckoutSessionPayload(sanitizedCart, "US", "https://printatelier.com", {}, sellableCatalog());

  assert.equal(payload.lineItems[0].unitAmountCents, Math.round(midnight.retailPrice * 100));
});
