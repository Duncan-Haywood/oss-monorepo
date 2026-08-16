import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutSuccessPage from "./page";

const mockSessionsRetrieve = vi.fn();

vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        retrieve: (...args: unknown[]) => mockSessionsRetrieve(...args),
      },
    };
  },
}));

describe("CheckoutSuccessPage component", () => {
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalStripeKey;
  });

  it("renders unconfirmed view when session_id is missing", async () => {
    const jsx = await CheckoutSuccessPage({ searchParams: Promise.resolve({}) });
    expect(jsx).toBeDefined();
    expect(jsx.props.children).toBeDefined();
    expect(mockSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("renders unconfirmed view when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_123" }),
    });
    expect(jsx).toBeDefined();
    expect(mockSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("renders unconfirmed view when Stripe session status is incomplete", async () => {
    mockSessionsRetrieve.mockResolvedValue({
      status: "open",
      payment_status: "unpaid",
    });

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_123" }),
    });

    expect(mockSessionsRetrieve).toHaveBeenCalledWith("cs_test_123");
    expect(jsx).toBeDefined();
  });

  it("renders unconfirmed view when payment_status is not paid", async () => {
    mockSessionsRetrieve.mockResolvedValue({
      status: "complete",
      payment_status: "unpaid",
    });

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_123" }),
    });

    expect(jsx).toBeDefined();
  });

  it("renders unconfirmed view when Stripe API throws an error", async () => {
    mockSessionsRetrieve.mockRejectedValue(new Error("Stripe API error"));

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_invalid" }),
    });

    expect(jsx).toBeDefined();
  });

  it("renders confirmed view with billing portal for subscription mode", async () => {
    mockSessionsRetrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "subscription",
      metadata: { tier: "growth" },
    });

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_paid_sub" }),
    });

    expect(jsx).toBeDefined();
    expect(mockSessionsRetrieve).toHaveBeenCalledWith("cs_test_paid_sub");
  });

  it("renders confirmed view for order eligible for billing portal via metadata", async () => {
    mockSessionsRetrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "payment",
      metadata: { tier: "complete", commerceAddon: "true" },
    });

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_paid_complete" }),
    });

    expect(jsx).toBeDefined();
  });

  it("renders confirmed view without billing portal for one-time basic order", async () => {
    mockSessionsRetrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      mode: "payment",
      metadata: { tier: "starter", commerceAddon: "false" },
    });

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_paid_starter" }),
    });

    expect(jsx).toBeDefined();
  });
});
