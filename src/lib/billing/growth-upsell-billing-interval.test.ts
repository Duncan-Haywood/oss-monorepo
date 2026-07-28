import { describe, expect, it, vi } from "vitest";
import { resolveGrowthOrderBillingInterval } from "./growth-upsell-billing-interval";

function fakeStripe(subscription: unknown) {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => ({ subscription })),
      },
    },
  };
}

describe("resolveGrowthOrderBillingInterval", () => {
  it("returns \"annual\" when the Session's expanded Subscription recurs yearly", async () => {
    const stripe = fakeStripe({
      items: { data: [{ price: { recurring: { interval: "year" } } }] },
    });
    await expect(
      resolveGrowthOrderBillingInterval(stripe, "cs_test_annual"),
    ).resolves.toBe("annual");
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_annual", {
      expand: ["subscription"],
    });
  });

  it("returns \"monthly\" when the Session's expanded Subscription recurs monthly", async () => {
    const stripe = fakeStripe({
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
    });
    await expect(resolveGrowthOrderBillingInterval(stripe, "cs_test_monthly")).resolves.toBe(
      "monthly",
    );
  });

  it("defaults to \"monthly\" when the Session has no subscription (payment mode or unexpanded)", async () => {
    const stripe = fakeStripe(undefined);
    await expect(resolveGrowthOrderBillingInterval(stripe, "cs_test_none")).resolves.toBe(
      "monthly",
    );
  });

  it("defaults to \"monthly\" when subscription is a string id (not expanded)", async () => {
    const stripe = fakeStripe("sub_not_expanded");
    await expect(resolveGrowthOrderBillingInterval(stripe, "cs_test_string")).resolves.toBe(
      "monthly",
    );
  });

  it("defaults to \"monthly\" without throwing when the Stripe retrieve call rejects", async () => {
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => {
            throw new Error("Stripe API error");
          }),
        },
      },
    };
    await expect(resolveGrowthOrderBillingInterval(stripe, "cs_test_error")).resolves.toBe(
      "monthly",
    );
  });
});
