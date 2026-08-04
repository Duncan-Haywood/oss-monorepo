/**
 * The order summary must disclose tax the way the Stripe session actually
 * charges it.
 *
 * `checkout-charges-what-it-quotes.test.ts` bound the *total* to what Stripe is
 * asked to charge. It left one path where the two still diverge: with
 * `STRIPE_AUTOMATIC_TAX=enabled`, `stripe-checkout-server.ts` sends
 * `automatic_tax: { enabled: true }` and Stripe adds tax on top of the total,
 * while the summary printed "Tax — Not charged".
 *
 * It printed that unconditionally. `CheckoutLab` is a `"use client"` component
 * and `STRIPE_AUTOMATIC_TAX` is a server variable, so the `process.env` read
 * behind `totals.taxCollectedAtCheckout` resolved to `undefined` in the browser
 * bundle whatever the deployment was set to. The "Calculated at checkout"
 * string was unreachable.
 *
 * These tests render the component rather than reading its source, so a
 * rewrite that keeps the strings and loses the wiring still fails. The page
 * test is the one that catches the original defect: the flag has to be resolved
 * on the server and handed down, and nothing else in the route can do it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CheckoutLab from "../src/components/CheckoutLab";
import CheckoutPage from "../src/app/checkout/page";
import { isAutomaticTaxEnabled } from "../src/lib/checkout";

function findCheckoutLabProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const element = node as ReactElement & { props?: Record<string, unknown> };
  const type = element.type as unknown;
  if (typeof type === "function" && (type as { name?: string }).name === "CheckoutLab") {
    return element.props ?? {};
  }
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findCheckoutLabProps(child);
      if (found) return found;
    }
    return null;
  }
  return findCheckoutLabProps(children);
}

test("the summary says tax is calculated at checkout exactly when Stripe will add it", () => {
  const on = renderToStaticMarkup(createElement(CheckoutLab, { automaticTaxEnabled: true }));
  assert.ok(
    on.includes("Calculated at checkout"),
    "automatic tax is on and the summary does not say tax will be added",
  );
  assert.ok(
    !on.includes("Not charged"),
    "automatic tax is on and the summary still tells the buyer tax is not charged",
  );

  const off = renderToStaticMarkup(createElement(CheckoutLab, { automaticTaxEnabled: false }));
  assert.ok(
    off.includes("Not charged"),
    "automatic tax is off and the summary does not say so",
  );
  assert.ok(
    !off.includes("Calculated at checkout"),
    "automatic tax is off and the summary implies tax will be added",
  );
});

test("the checkout page resolves the server flag and hands it to the client summary", () => {
  const original = process.env.STRIPE_AUTOMATIC_TAX;
  try {
    process.env.STRIPE_AUTOMATIC_TAX = "enabled";
    const enabled = findCheckoutLabProps(CheckoutPage());
    assert.ok(enabled, "the checkout page no longer renders CheckoutLab");
    assert.equal(
      enabled.automaticTaxEnabled,
      true,
      "STRIPE_AUTOMATIC_TAX is enabled but the summary is not told, so it will " +
        "print a total that Stripe adds tax to",
    );

    delete process.env.STRIPE_AUTOMATIC_TAX;
    const disabled = findCheckoutLabProps(CheckoutPage());
    assert.ok(disabled);
    assert.equal(disabled.automaticTaxEnabled, false);
  } finally {
    if (original === undefined) delete process.env.STRIPE_AUTOMATIC_TAX;
    else process.env.STRIPE_AUTOMATIC_TAX = original;
  }
});

test("the flag the page reads is the one the Stripe session is built from", () => {
  // One predicate on both sides of the boundary. If these ever diverge the
  // summary and the session disagree again, which is the whole defect.
  assert.equal(isAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: "enabled" }), true);
  assert.equal(isAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: "true" }), false);
  assert.equal(isAutomaticTaxEnabled({}), false);
});
