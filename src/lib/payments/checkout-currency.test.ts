import { describe, expect, it } from "vitest";
import {
  CHECKOUT_CURRENCY_USD,
  isStripeCheckoutCurrencyUsd,
} from "./checkout-currency";

describe("isStripeCheckoutCurrencyUsd", () => {
  it("accepts exact usd", () => {
    expect(isStripeCheckoutCurrencyUsd(CHECKOUT_CURRENCY_USD)).toBe(true);
  });

  it("accepts trimmed / mixed-case USD", () => {
    expect(isStripeCheckoutCurrencyUsd(" USD ")).toBe(true);
    expect(isStripeCheckoutCurrencyUsd("Usd")).toBe(true);
  });

  it("rejects other currencies", () => {
    expect(isStripeCheckoutCurrencyUsd("eur")).toBe(false);
    expect(isStripeCheckoutCurrencyUsd("gbp")).toBe(false);
    expect(isStripeCheckoutCurrencyUsd("jpy")).toBe(false);
  });

  it("rejects missing / non-string / blank", () => {
    expect(isStripeCheckoutCurrencyUsd(undefined)).toBe(false);
    expect(isStripeCheckoutCurrencyUsd(null)).toBe(false);
    expect(isStripeCheckoutCurrencyUsd(1)).toBe(false);
    expect(isStripeCheckoutCurrencyUsd("")).toBe(false);
    expect(isStripeCheckoutCurrencyUsd("   ")).toBe(false);
  });
});
