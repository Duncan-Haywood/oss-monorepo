import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH } from "@/lib/billing/checkout-session-id";
import { loadCheckoutSuccessSession } from "./success-session";

const emptyLineItems = vi.fn().mockResolvedValue({ data: [] });

afterEach(() => {
  emptyLineItems.mockClear();
  emptyLineItems.mockResolvedValue({ data: [] });
});

describe("loadCheckoutSuccessSession", () => {
  it("does not call Stripe when session_id is missing", async () => {
    const retrieve = vi.fn();
    const listLineItems = vi.fn();
    const result = await loadCheckoutSuccessSession(undefined, {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
    expect(listLineItems).not.toHaveBeenCalled();
  });

  it("does not call Stripe when session_id is whitespace-only", async () => {
    const retrieve = vi.fn();
    const listLineItems = vi.fn();
    const result = await loadCheckoutSuccessSession("   ", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
    expect(listLineItems).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long session_id before Stripe retrieve (no soft-cap)", async () => {
    const retrieve = vi.fn();
    const listLineItems = vi.fn();
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);

    const result = await loadCheckoutSuccessSession(over, {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
    expect(listLineItems).not.toHaveBeenCalled();
  });

  it("does not call Stripe when STRIPE_SECRET_KEY is unset", async () => {
    const retrieve = vi.fn();
    const listLineItems = vi.fn();
    const result = await loadCheckoutSuccessSession("cs_test_ok", {
      secretKey: undefined,
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).not.toHaveBeenCalled();
    expect(listLineItems).not.toHaveBeenCalled();
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
      listLineItems: emptyLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(retrieve).toHaveBeenCalledWith("cs_test_ok");
    expect(emptyLineItems).not.toHaveBeenCalled();
  });

  it("returns confirmed + billing portal for a completed subscription session", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "subscription",
      metadata: { tier: "growth", commerceAddon: "false" },
    });
    const listLineItems = vi.fn();
    const result = await loadCheckoutSuccessSession("  cs_test_ok  ", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_test_ok",
      showBillingPortal: true,
    });
    // Subscription mode skips the line-item round-trip (portal API twin).
    expect(listLineItems).not.toHaveBeenCalled();
  });

  it("returns unconfirmed when complete but payment_status is unpaid (async ACH)", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      payment_status: "unpaid",
      mode: "payment",
      metadata: { tier: "starter" },
    });
    const result = await loadCheckoutSuccessSession("cs_async_pending", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems: emptyLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(emptyLineItems).not.toHaveBeenCalled();
  });

  it("returns confirmed without billing portal for a one-time Starter payment", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "payment",
      metadata: { tier: "starter", commerceAddon: "false" },
    });
    const result = await loadCheckoutSuccessSession("cs_test_starter", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems: emptyLineItems,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_test_starter",
      showBillingPortal: false,
    });
    expect(emptyLineItems).toHaveBeenCalledWith("cs_test_starter");
  });

  it("does not trust metadata.tier=growth on payment-mode success page", async () => {
    // Create path never emits payment+growth — forged metadata must not surface
    // Manage subscription (portal API also ignores tier on payment mode).
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "payment",
      metadata: { tier: "growth", commerceAddon: "false" },
    });
    const result = await loadCheckoutSuccessSession("cs_forged_tier", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems: emptyLineItems,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_forged_tier",
      showBillingPortal: false,
    });
  });

  it("does not trust metadata.commerceAddon=true without Commerce Price line items", async () => {
    const prevSetup = process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    const prevMonthly = process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
    try {
      const retrieve = vi.fn().mockResolvedValue({
        status: "complete",
        payment_status: "paid",
        mode: "payment",
        metadata: { tier: "starter", commerceAddon: "true" },
      });
      const listLineItems = vi.fn().mockResolvedValue({
        data: [{ price: { id: "price_starter_only" } }],
      });
      const result = await loadCheckoutSuccessSession("cs_forged_addon", {
        secretKey: "sk_test_x",
        retrieve,
        listLineItems,
      });
      expect(result).toEqual({
        confirmed: true,
        sessionId: "cs_forged_addon",
        showBillingPortal: false,
      });
      expect(listLineItems).toHaveBeenCalledWith("cs_forged_addon");
    } finally {
      if (prevSetup === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
      else process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = prevSetup;
      if (prevMonthly === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
      else process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = prevMonthly;
    }
  });

  it("shows billing portal when both Commerce Price IDs are on payment-mode line items", async () => {
    const prevSetup = process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    const prevMonthly = process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
    try {
      const retrieve = vi.fn().mockResolvedValue({
        status: "complete",
        payment_status: "paid",
        mode: "payment",
        // Metadata says false — line items still prove Commerce was charged.
        metadata: { tier: "starter", commerceAddon: "false" },
      });
      const listLineItems = vi.fn().mockResolvedValue({
        data: [
          { price: { id: "price_commerce_setup" } },
          { price: { id: "price_commerce_monthly" } },
        ],
      });
      const result = await loadCheckoutSuccessSession("cs_commerce_lines", {
        secretKey: "sk_test_x",
        retrieve,
        listLineItems,
      });
      expect(result).toEqual({
        confirmed: true,
        sessionId: "cs_commerce_lines",
        showBillingPortal: true,
      });
    } finally {
      if (prevSetup === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
      else process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = prevSetup;
      if (prevMonthly === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
      else process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = prevMonthly;
    }
  });

  it("hides billing portal when listLineItems fails on payment mode (fail closed)", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "payment",
      metadata: { tier: "starter", commerceAddon: "true" },
    });
    const listLineItems = vi.fn().mockRejectedValue(new Error("stripe line items down"));
    const result = await loadCheckoutSuccessSession("cs_list_fail", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: "cs_list_fail",
      showBillingPortal: false,
    });
  });

  it("returns unconfirmed when retrieve throws (invalid id / network)", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("No such checkout.session"));
    const listLineItems = vi.fn();
    const result = await loadCheckoutSuccessSession("cs_test_missing", {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems,
    });
    expect(result).toEqual({ confirmed: false });
    expect(listLineItems).not.toHaveBeenCalled();
  });

  it("accepts an exact-max-length session id (boundary)", async () => {
    const exact = "c".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "payment",
      metadata: { tier: "starter" },
    });
    const result = await loadCheckoutSuccessSession(exact, {
      secretKey: "sk_test_x",
      retrieve,
      listLineItems: emptyLineItems,
    });
    expect(result).toEqual({
      confirmed: true,
      sessionId: exact,
      showBillingPortal: false,
    });
    expect(retrieve).toHaveBeenCalledWith(exact);
  });
});
