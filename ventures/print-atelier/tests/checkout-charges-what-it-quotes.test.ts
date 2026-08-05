import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildCheckoutSessionPayload,
  buildSampleCheckoutCart,
  calculateCheckoutTotals,
  isAutomaticTaxEnabled,
  type CheckoutShippingRegion,
} from "../src/lib/checkout";
import { buildStripeCheckoutCreateParams } from "../src/lib/stripe-checkout-server";
import { sellableCatalog } from "./support/print-files.ts";

/**
 * The order summary renders a bolded "Total". Before this suite that number was
 * `subtotal + shipping + tax` while the Stripe session carried only the print
 * line items: a US cart quoted $99.11 and charged $85.00, and EU/UK carts
 * quoted 20% VAT that was neither collected nor remitted.
 *
 * The invariant here is that the quoted total is the charged total. Shipping is
 * now a real Stripe shipping rate. Tax is Stripe's to compute when a deployment
 * has a registration, and is otherwise not charged and not quoted — this
 * checkout has no tax registration behind its rate table, so collecting against
 * it would be worse than not collecting at all.
 */

const REGIONS: CheckoutShippingRegion[] = ["US", "EU", "UK", "APAC"];

function chargedCents(
  params: ReturnType<typeof buildStripeCheckoutCreateParams>,
): number {
  const items = (params.line_items ?? []).reduce((sum, item) => {
    const unit = item.price_data?.unit_amount ?? 0;
    return sum + unit * (item.quantity ?? 1);
  }, 0);
  const shipping = (params.shipping_options ?? []).reduce((sum, option) => {
    const rate = option.shipping_rate_data;
    return sum + (rate?.fixed_amount?.amount ?? 0);
  }, 0);
  return items + shipping;
}

for (const region of REGIONS) {
  test(`the ${region} order summary total is exactly what Stripe is asked to charge`, () => {
    const cart = buildSampleCheckoutCart(sellableCatalog());
    const totals = calculateCheckoutTotals(cart, region);
    const payload = buildCheckoutSessionPayload(cart, region, "https://printatelier.test", {}, sellableCatalog());
    const params = buildStripeCheckoutCreateParams(payload);

    assert.equal(
      chargedCents(params),
      Math.round(totals.total * 100),
      `${region}: quoted ${totals.total} but Stripe charges ${chargedCents(params) / 100}`,
    );
  });

  test(`the ${region} total includes the shipping it quotes`, () => {
    const cart = buildSampleCheckoutCart(sellableCatalog());
    const totals = calculateCheckoutTotals(cart, region);
    const params = buildStripeCheckoutCreateParams(
      buildCheckoutSessionPayload(cart, region, "https://printatelier.test", {}, sellableCatalog()),
    );

    assert.ok(totals.shippingEstimate > 0, "the summary quotes a shipping charge");
    const shipping = (params.shipping_options ?? []).reduce(
      (sum, option) => sum + (option.shipping_rate_data?.fixed_amount?.amount ?? 0),
      0,
    );
    assert.equal(shipping, Math.round(totals.shippingEstimate * 100));
  });
}

test("an empty cart quotes no shipping and asks Stripe for no shipping rate", () => {
  const totals = calculateCheckoutTotals([], "US");
  assert.equal(totals.shippingEstimate, 0);
  assert.equal(totals.total, 0);

  const params = buildStripeCheckoutCreateParams(
    buildCheckoutSessionPayload([], "US", "https://printatelier.test", {}, sellableCatalog()),
  );
  assert.equal(params.shipping_options, undefined);
});

test("no tax is quoted into the total, in any region", () => {
  for (const region of REGIONS) {
    const cart = buildSampleCheckoutCart(sellableCatalog());
    const totals = calculateCheckoutTotals(cart, region);
    assert.equal(
      totals.total,
      Math.round((totals.subtotal + totals.shippingEstimate) * 100) / 100,
      `${region} folds an uncollected tax into the total`,
    );
  }
});

test("automatic tax is off unless a deployment declares a registration", () => {
  assert.equal(isAutomaticTaxEnabled({}), false);
  assert.equal(isAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: "" }), false);
  assert.equal(isAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: "true" }), false);
  assert.equal(isAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: "enabled" }), true);
  assert.equal(isAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: " Enabled " }), true);

  const cart = buildSampleCheckoutCart(sellableCatalog());
  const off = buildStripeCheckoutCreateParams(
    buildCheckoutSessionPayload(cart, "UK", "https://printatelier.test", {}, sellableCatalog()),
  );
  assert.equal(off.automatic_tax, undefined, "Stripe rejects automatic tax with no registration");

  const on = buildStripeCheckoutCreateParams(
    buildCheckoutSessionPayload(
      cart,
      "UK",
      "https://printatelier.test",
      { STRIPE_AUTOMATIC_TAX: "enabled" },
      sellableCatalog(),
    ),
  );
  assert.deepEqual(on.automatic_tax, { enabled: true });
});

test("the order summary does not print a tax amount it will not charge", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/components/CheckoutLab.tsx"),
    "utf8",
  );
  assert.ok(
    !source.includes("formatCheckoutCurrency(totals.taxEstimate)"),
    "the summary renders an uncollected tax as an amount",
  );
  assert.match(source, /totals\.taxCollectedAtCheckout/);
});
