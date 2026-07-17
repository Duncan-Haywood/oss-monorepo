import { describe, expect, it } from "vitest";
import { isStripeCheckoutSessionPaid } from "./checkout-payment-status";

describe("isStripeCheckoutSessionPaid", () => {
  it("accepts paid only", () => {
    expect(isStripeCheckoutSessionPaid("paid")).toBe(true);
  });

  it("rejects unpaid / no_payment_required / missing", () => {
    expect(isStripeCheckoutSessionPaid("unpaid")).toBe(false);
    expect(isStripeCheckoutSessionPaid("no_payment_required")).toBe(false);
    expect(isStripeCheckoutSessionPaid(null)).toBe(false);
    expect(isStripeCheckoutSessionPaid(undefined)).toBe(false);
    expect(isStripeCheckoutSessionPaid("")).toBe(false);
    expect(isStripeCheckoutSessionPaid("PAID")).toBe(false);
  });
});
