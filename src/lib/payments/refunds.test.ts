import { describe, expect, it } from "vitest";
import {
  chargeHasRefund,
  chargePaymentIntentId,
  disputeStatusClearsDisputeFlag,
} from "./refunds";

describe("chargeHasRefund", () => {
  it("is false when amount_refunded is 0", () => {
    expect(chargeHasRefund({ amount_refunded: 0 })).toBe(false);
  });

  it("is false when amount_refunded is missing", () => {
    expect(chargeHasRefund({})).toBe(false);
  });

  it("is false when amount_refunded is null", () => {
    expect(chargeHasRefund({ amount_refunded: null })).toBe(false);
  });

  it("is false for a non-finite amount_refunded (defensive)", () => {
    expect(chargeHasRefund({ amount_refunded: Number.NaN })).toBe(false);
  });

  it("is true for a full refund", () => {
    expect(chargeHasRefund({ amount_refunded: 5000 })).toBe(true);
  });

  it("is true for a partial refund", () => {
    expect(chargeHasRefund({ amount_refunded: 500 })).toBe(true);
  });
});

describe("chargePaymentIntentId", () => {
  it("returns the id when payment_intent is a bare string", () => {
    expect(chargePaymentIntentId({ payment_intent: "pi_123" })).toBe("pi_123");
  });

  it("returns the id when payment_intent is an expanded object", () => {
    expect(chargePaymentIntentId({ payment_intent: { id: "pi_456" } })).toBe(
      "pi_456",
    );
  });

  it("returns null when payment_intent is missing", () => {
    expect(chargePaymentIntentId({})).toBeNull();
  });

  it("returns null when payment_intent is null", () => {
    expect(chargePaymentIntentId({ payment_intent: null })).toBeNull();
  });

  it("returns null for a blank string payment_intent", () => {
    expect(chargePaymentIntentId({ payment_intent: "  " })).toBeNull();
  });

  it("returns null when the expanded object has no id", () => {
    expect(chargePaymentIntentId({ payment_intent: {} })).toBeNull();
  });
});

describe("disputeStatusClearsDisputeFlag", () => {
  it("is true for won (funds reinstated)", () => {
    expect(disputeStatusClearsDisputeFlag("won")).toBe(true);
  });

  it("is true for warning_closed (inquiry closed without chargeback)", () => {
    expect(disputeStatusClearsDisputeFlag("warning_closed")).toBe(true);
  });

  it("is false for lost (chargeback stands)", () => {
    expect(disputeStatusClearsDisputeFlag("lost")).toBe(false);
  });

  it("is false for open/in-progress statuses", () => {
    expect(disputeStatusClearsDisputeFlag("needs_response")).toBe(false);
    expect(disputeStatusClearsDisputeFlag("under_review")).toBe(false);
    expect(disputeStatusClearsDisputeFlag("warning_needs_response")).toBe(false);
  });

  it("is false for missing/unknown status", () => {
    expect(disputeStatusClearsDisputeFlag(undefined)).toBe(false);
    expect(disputeStatusClearsDisputeFlag(null)).toBe(false);
    expect(disputeStatusClearsDisputeFlag("")).toBe(false);
    expect(disputeStatusClearsDisputeFlag("charge_refunded")).toBe(false);
  });
});
