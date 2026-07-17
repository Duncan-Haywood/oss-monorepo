import { describe, expect, it, vi } from "vitest";
import { MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH } from "@/lib/billing/checkout-session-id";
import { loadCheckoutSuccessSession } from "./success-session";

describe("loadCheckoutSuccessSession", () => {
  it("does not call Stripe when session_id is missing", async () => {
    const retrieve = vi.fn();
    const result = await loadCheckoutSuccessSession(undefined, {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("does not call Stripe when session_id is whitespace-only", async () => {
    const retrieve = vi.fn();
    const result = await loadCheckoutSuccessSession("   ", {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long session_id before Stripe retrieve (no soft-cap)", async () => {
    const retrieve = vi.fn();
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);

    const result = await loadCheckoutSuccessSession(over, {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("does not call Stripe when STRIPE_SECRET_KEY is unset", async () => {
    const retrieve = vi.fn();
    const result = await loadCheckoutSuccessSession("cs_test_ok", {
      secretKey: undefined,
      retrieve,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns unconfirmed when session status is not complete", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "open",
      mode: "payment",
      metadata: {},
    });
    const result = await loadCheckoutSuccessSession("cs_test_ok", {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).toHaveBeenCalledWith("cs_test_ok");
  });

  it("returns confirmed + billing portal for a completed subscription session", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      mode: "subscription",
      metadata: { tier: "growth", commerceAddon: "false" },
    });
    const result = await loadCheckoutSuccessSession("  cs_test_ok  ", {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_test_ok",
      showBillingPortal: true,
    });
  });

  it("returns confirmed without billing portal for a one-time Starter payment", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      mode: "payment",
      metadata: { tier: "starter", commerceAddon: "false" },
    });
    const result = await loadCheckoutSuccessSession("cs_test_starter", {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_test_starter",
      showBillingPortal: false,
    });
  });

  it("does not trust metadata.tier=growth on payment-mode success page", async () => {
    // Create path never emits payment+growth — forged metadata must not surface
    // Manage subscription (portal API also ignores tier on payment mode).
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      mode: "payment",
      metadata: { tier: "growth", commerceAddon: "false" },
    });
    const result = await loadCheckoutSuccessSession("cs_forged_tier", {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_forged_tier",
      showBillingPortal: false,
    });
  });

  it("returns unconfirmed when retrieve throws (invalid id / network)", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("No such checkout.session"));
    const result = await loadCheckoutSuccessSession("cs_test_missing", {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({ confirmed: false });
  });

  it("accepts an exact-max-length session id (boundary)", async () => {
    const exact = "c".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      mode: "payment",
      metadata: { tier: "starter" },
    });
    const result = await loadCheckoutSuccessSession(exact, {
      secretKey: "sk_test_x",
      retrieve,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: exact,
      showBillingPortal: false,
    });
    expect(retrieve).toHaveBeenCalledWith(exact);
  });
});
