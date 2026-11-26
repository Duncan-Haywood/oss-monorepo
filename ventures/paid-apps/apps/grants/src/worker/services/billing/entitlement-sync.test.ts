import { describe, expect, it } from "vitest";
import { PaddleBillingProvider } from "../../ports/billing/paddle";
import { entitlementToPaddleEvent } from "./entitlement-sync";

describe("entitlementToPaddleEvent", () => {
  const row = {
    user_sub: "pco_tok.sig",
    status: "active",
    plan: "pri_st_m",
    subscription_id: "sub_1",
    customer_id: "ctm_1",
    period_end_ms: Date.UTC(2026, 11, 25),
    occurred_ms: Date.UTC(2026, 10, 25),
    updated_text: "2026-11-25 00:00:01+00",
  };
  const paddle = new PaddleBillingProvider({
    apiKey: "pdl_sdbx_x",
    webhookSecret: "",
    priceIds: { starter: "pri_st_m" },
  });

  it("normalizes like a real Paddle subscription event, binding only through the token", () => {
    const e = paddle.normalize(entitlementToPaddleEvent(row));
    expect(e.providerEventId).toBe(`ent_sub_1_${row.occurred_ms}`);
    expect(e.checkoutToken).toBe("pco_tok.sig");
    expect(e.occurredAt?.getTime()).toBe(row.occurred_ms);
    expect(e.subscription).toMatchObject({
      planKey: "starter",
      status: "active",
      providerSubscriptionId: "sub_1",
      providerCustomerId: "ctm_1",
      currentPeriodEnd: new Date(row.period_end_ms),
      cancelAtPeriodEnd: false,
    });
  });

  it("grants nothing for an unknown price or status", () => {
    expect(
      paddle.normalize(entitlementToPaddleEvent({ ...row, plan: "pri_other" })).subscription,
    ).toBeUndefined();
    expect(
      paddle.normalize(entitlementToPaddleEvent({ ...row, status: "weird" })).subscription,
    ).toBeUndefined();
  });
});
