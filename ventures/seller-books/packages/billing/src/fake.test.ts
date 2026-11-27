import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKOUT_TOKEN_KEY } from "./checkout-token.ts";
import { PromoCodeError, WebhookSignatureError } from "./crypto.ts";
import { createBillingProvider } from "./factory.ts";
import {
  FAKE_SIGNATURE_HEADER,
  fakeWebhookRequest,
  SignedFakeBillingProvider,
  signFakeWebhook,
} from "./fake.ts";
import { PaddleBillingProvider } from "./paddle.ts";

const URL_ = "https://app.test/api/billing/webhook";

describe("SignedFakeBillingProvider", () => {
  it("verifies signatures and normalizes like Paddle (token only, no orgId)", async () => {
    const fake = new SignedFakeBillingProvider();
    const ev = await fake.parseWebhook(
      await fakeWebhookRequest(URL_, {
        providerEventId: "evt_1",
        type: "subscription.created",
        occurredAt: "2026-11-24T00:00:00Z",
        customData: { [CHECKOUT_TOKEN_KEY]: "pco_x.sig", orgId: "org_victim" },
        subscription: {
          planKey: "starter",
          status: "active",
          providerCustomerId: "ctm_1",
          providerSubscriptionId: "sub_1",
          currentPeriodStart: "2026-11-24T00:00:00Z",
        },
      }),
    );
    assert.equal(ev.checkoutToken, "pco_x.sig");
    assert.equal(ev.providerSubscriptionId, "sub_1");
    assert.deepEqual(ev.occurredAt, new Date("2026-11-24T00:00:00Z"));
    assert.equal(ev.subscription?.cancelAtPeriodEnd, false);
    assert.equal(ev.subscription?.currentPeriodEnd, null);
    assert.ok(!("orgId" in ev));
  });

  it("rejects missing, wrong-secret and tampered signatures", async () => {
    const fake = new SignedFakeBillingProvider("s3cret");
    const body = JSON.stringify({ providerEventId: "e" });
    await assert.rejects(fake.parseWebhook(new Request(URL_, { method: "POST", body })), /Missing/);
    await assert.rejects(
      fake.parseWebhook(await fakeWebhookRequest(URL_, { providerEventId: "e" })),
      WebhookSignatureError,
    );
    const sig = await signFakeWebhook(body, "s3cret");
    await assert.rejects(
      fake.parseWebhook(
        new Request(URL_, {
          method: "POST",
          body: body.replace("e", "f"),
          headers: { [FAKE_SIGNATURE_HEADER]: sig },
        }),
      ),
      WebhookSignatureError,
    );
  });

  it("checkout and portal return local URLs; unknown promo codes are rejected", async () => {
    const fake = new SignedFakeBillingProvider({ promoCodes: ["launch"] });
    const base = { checkoutToken: "t", customerEmail: "a@b.c", cancelUrl: "c" };
    assert.deepEqual(
      await fake.createCheckout({
        ...base,
        planKey: "pro:annual",
        successUrl: "/ok?x=1",
        promoCode: "LAUNCH",
      }),
      { url: "/ok?x=1&fake_checkout=pro%3Aannual&promo=LAUNCH" },
    );
    await assert.rejects(
      fake.createCheckout({ ...base, planKey: "pro", successUrl: "/ok", promoCode: "PILOT50" }),
      PromoCodeError,
    );
    assert.deepEqual(await fake.createPortalSession("ctm", "/billing"), {
      url: "/billing?fake_portal=1",
    });
  });
});

describe("createBillingProvider", () => {
  it("selects fake in tests / demo, Paddle when fully configured, else null", () => {
    assert.ok(createBillingProvider({ APP_ENV: "test" }) instanceof SignedFakeBillingProvider);
    assert.ok(
      createBillingProvider({ FAKE_EXTERNALS: "true" }) instanceof SignedFakeBillingProvider,
    );
    const paddle = createBillingProvider({
      BILLING_PROVIDER: "Paddle",
      BILLING_API_KEY: "pdl_sdbx_apikey_x",
      BILLING_WEBHOOK_SECRET: "whsec",
      BILLING_PRICE_IDS: '{"starter":"pri_1"}',
    });
    assert.ok(paddle instanceof PaddleBillingProvider);
    assert.equal(paddle.name, "paddle");
    assert.equal(createBillingProvider({ BILLING_PROVIDER: "paddle", BILLING_API_KEY: "k" }), null);
    assert.equal(createBillingProvider({}), null);
  });
});
