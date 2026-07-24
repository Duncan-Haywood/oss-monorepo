import { describe, expect, it } from "vitest";
import { isStripeCheckoutSessionPaid } from "./checkout-payment-status";

describe("isStripeCheckoutSessionPaid", () => {
  it("accepts paid and no_payment_required (100%-off promo code — terminal, never resolves further)", () => {
    expect(isStripeCheckoutSessionPaid("paid")).toBe(true);
    expect(isStripeCheckoutSessionPaid("no_payment_required")).toBe(true);
  });

  it("rejects unpaid / missing (async ACH/bank pending — a later event resolves it)", () => {
    expect(isStripeCheckoutSessionPaid("unpaid")).toBe(false);
    expect(isStripeCheckoutSessionPaid(null)).toBe(false);
    expect(isStripeCheckoutSessionPaid(undefined)).toBe(false);
    expect(isStripeCheckoutSessionPaid("")).toBe(false);
    expect(isStripeCheckoutSessionPaid("PAID")).toBe(false);
  });
});
