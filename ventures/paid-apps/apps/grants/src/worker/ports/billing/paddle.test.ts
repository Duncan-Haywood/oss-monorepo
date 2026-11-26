import { describe, expect, it } from "vitest";
import { CHECKOUT_TOKEN_KEY } from "./checkout-token";
import { hmacSha256Hex, PromoCodeError, WebhookSignatureError } from "./crypto";
import { PaddleBillingProvider, paddleBaseUrl } from "./paddle";

const SECRET = "pdl_ntfset_test_secret";
const NOW = 1_763_500_000_000;

const subscriptionEvent = {
  event_id: "evt_01",
  event_type: "subscription.updated",
  occurred_at: "2026-11-19T00:00:00Z",
  data: {
    id: "sub_01",
    status: "active",
    customer_id: "ctm_01",
    custom_data: { [CHECKOUT_TOKEN_KEY]: "pco_token.sig", orgId: "org_abc", planKey: "standard" },
    items: [{ price: { id: "pri_std_m" } }],
    current_billing_period: {
      starts_at: "2026-11-01T00:00:00Z",
      ends_at: "2026-12-01T00:00:00Z",
    },
    scheduled_change: { action: "cancel", effective_at: "2026-12-01T00:00:00Z" },
  },
};

function provider(fetchFn?: typeof fetch) {
  return new PaddleBillingProvider({
    apiKey: "pdl_sdbx_apikey_test",
    webhookSecret: SECRET,
    priceIds: { starter: "pri_st_m", "starter:annual": "pri_st_y", standard: "pri_std_m" },
    now: () => NOW,
    fetch: fetchFn,
  });
}

async function signedRequest(body: string, ts = Math.floor(NOW / 1000), secret = SECRET) {
  const h1 = await hmacSha256Hex(secret, `${ts}:${body}`);
  return new Request("https://app.test/api/billing/webhook", {
    method: "POST",
    body,
    headers: { "Paddle-Signature": `ts=${ts};h1=${h1}` },
  });
}

describe("PaddleBillingProvider.parseWebhook", () => {
  it("verifies the HMAC and normalizes subscription events", async () => {
    const ev = await provider().parseWebhook(
      await signedRequest(JSON.stringify(subscriptionEvent)),
    );
    expect(ev.providerEventId).toBe("evt_01");
    expect(ev.occurredAt).toEqual(new Date("2026-11-19T00:00:00Z"));
    expect(ev.providerSubscriptionId).toBe("sub_01");
    // Only the opaque token is surfaced; custom_data.orgId is never exposed as an org binding.
    expect(ev.checkoutToken).toBe("pco_token.sig");
    expect(ev).not.toHaveProperty("orgId");
    expect(ev.subscription).toEqual({
      planKey: "standard",
      status: "active",
      providerCustomerId: "ctm_01",
      providerSubscriptionId: "sub_01",
      currentPeriodStart: new Date("2026-11-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
      cancelAtPeriodEnd: true,
    });
  });

  it("rejects a wrong secret, a tampered body, a stale timestamp and a missing header", async () => {
    const body = JSON.stringify(subscriptionEvent);
    const p = provider();
    await expect(p.parseWebhook(await signedRequest(body, undefined, "wrong"))).rejects.toThrow(
      WebhookSignatureError,
    );
    const req = await signedRequest(body);
    const tampered = new Request(req.url, {
      method: "POST",
      body: body.replace("standard", "pro"),
      headers: req.headers,
    });
    await expect(p.parseWebhook(tampered)).rejects.toThrow(WebhookSignatureError);
    await expect(
      p.parseWebhook(await signedRequest(body, Math.floor(NOW / 1000) - 3600)),
    ).rejects.toThrow(/Stale/);
    await expect(
      p.parseWebhook(new Request("https://app.test/x", { method: "POST", body })),
    ).rejects.toThrow(/Missing/);
  });

  it("ignores a crafted custom_data.orgId and reads subscription_id on transaction events", () => {
    const crafted = provider().normalize({
      event_id: "evt_02",
      event_type: "transaction.completed",
      occurred_at: "2026-11-19T00:00:01Z",
      data: { id: "txn_1", subscription_id: "sub_01", custom_data: { orgId: "org_victim" } },
    });
    expect(crafted.checkoutToken).toBeNull();
    expect(crafted.providerSubscriptionId).toBe("sub_01");
    expect(crafted.subscription).toBeUndefined();
    expect(JSON.stringify({ ...crafted, raw: null })).not.toContain("org_victim");
  });

  it("maps the plan from the price id when custom_data lacks it", () => {
    const ev = provider().normalize({
      ...subscriptionEvent,
      data: {
        ...subscriptionEvent.data,
        custom_data: { orgId: "org_abc" },
        items: [{ price: { id: "pri_st_y" } }],
      },
    });
    expect(ev.subscription?.planKey).toBe("starter");
  });

  it("derives the plan from the billed price, never from custom_data (no plan escalation)", () => {
    // Starter price paid, custom_data claims "pro" (Paddle.js checkouts let clients set it).
    const escalated = provider().normalize({
      ...subscriptionEvent,
      data: {
        ...subscriptionEvent.data,
        custom_data: { orgId: "org_abc", planKey: "pro" },
        items: [{ price: { id: "pri_st_m" } }],
      },
    });
    expect(escalated.subscription?.planKey).toBe("starter");
    // Unknown price: no subscription data at all (ignored), even with a plan in custom_data.
    const unknownPrice = provider().normalize({
      ...subscriptionEvent,
      data: {
        ...subscriptionEvent.data,
        custom_data: { orgId: "org_abc", planKey: "pro" },
        items: [{ price: { id: "pri_attacker" } }],
      },
    });
    expect(unknownPrice.subscription).toBeUndefined();
  });
});

describe("PaddleBillingProvider.createCheckout", () => {
  it("creates a transaction with customer, discount and only the signed token in custom_data", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        method: init?.method ?? "GET",
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.includes("/customers?email=")) return Response.json({ data: [] });
      if (url.endsWith("/customers")) return Response.json({ data: { id: "ctm_new" } });
      if (url.includes("/discounts?code="))
        return Response.json({ data: [{ id: "dsc_1", code: "PILOT50" }] });
      if (url.endsWith("/transactions"))
        return Response.json({
          data: { id: "txn_1", checkout: { url: "https://pay.example/?_ptxn=txn_1" } },
        });
      return new Response("{}", { status: 404 });
    };
    const res = await provider(fetchFn).createCheckout({
      checkoutToken: "pco_tok.sig",
      planKey: "starter:annual",
      customerEmail: "a@example.org",
      successUrl: "https://app/s",
      cancelUrl: "https://app/c",
      promoCode: "pilot50",
    });
    expect(res.url).toBe("https://pay.example/?_ptxn=txn_1");
    const txn = calls.find((c) => c.url.endsWith("/transactions"));
    expect(txn?.url.startsWith("https://sandbox-api.paddle.com")).toBe(true);
    expect(txn?.body).toMatchObject({
      items: [{ price_id: "pri_st_y", quantity: 1 }],
      customer_id: "ctm_new",
      discount_id: "dsc_1",
    });
    expect(txn?.body).toHaveProperty("custom_data", {
      [CHECKOUT_TOKEN_KEY]: "pco_tok.sig",
    });
  });

  it("reuses the org's existing customer instead of looking one up by email", async () => {
    const urls: string[] = [];
    let body: unknown = null;
    const fetchFn: typeof fetch = async (input, init) => {
      urls.push(String(input));
      body = init?.body ? JSON.parse(String(init.body)) : null;
      return Response.json({ data: { id: "txn_2", checkout: { url: "https://pay.example/2" } } });
    };
    await provider(fetchFn).createCheckout({
      checkoutToken: "pco_tok.sig",
      planKey: "starter",
      customerEmail: "other-admin@example.org",
      successUrl: "s",
      cancelUrl: "c",
      providerCustomerId: "ctm_existing",
    });
    expect(urls.some((u) => u.includes("/customers"))).toBe(false);
    expect(body).toMatchObject({ customer_id: "ctm_existing" });
  });

  it("throws PromoCodeError for unknown codes", async () => {
    const fetchFn: typeof fetch = async (input) =>
      String(input).includes("/customers")
        ? Response.json({ data: [{ id: "ctm_1" }] })
        : Response.json({ data: [] });
    await expect(
      provider(fetchFn).createCheckout({
        checkoutToken: "pco_tok.sig",
        planKey: "starter",
        customerEmail: "a@b.c",
        successUrl: "s",
        cancelUrl: "c",
        promoCode: "NOPE",
      }),
    ).rejects.toThrow(PromoCodeError);
  });

  it("infers sandbox vs live from the key prefix", () => {
    expect(paddleBaseUrl("pdl_sdbx_apikey_x")).toBe("https://sandbox-api.paddle.com");
    expect(paddleBaseUrl("pdl_live_apikey_x")).toBe("https://api.paddle.com");
  });
});

describe("PaddleBillingProvider on the AWS runtime (entitlementProduct)", () => {
  const aws = (fetchFn?: typeof fetch) =>
    new PaddleBillingProvider({
      apiKey: "pdl_sdbx_apikey_test",
      webhookSecret: "",
      priceIds: { starter: "pri_st_m" },
      now: () => NOW,
      fetch: fetchFn,
      entitlementProduct: "grants",
    });

  it("puts the same opaque token in user_sub for the starter's entitlement consumer", async () => {
    let body: unknown = null;
    const fetchFn: typeof fetch = async (_input, init) => {
      body = init?.body ? JSON.parse(String(init.body)) : null;
      return Response.json({ data: { id: "txn_3", checkout: { url: "https://pay.example/3" } } });
    };
    await aws(fetchFn).createCheckout({
      checkoutToken: "pco_tok.sig",
      planKey: "starter",
      customerEmail: "a@b.c",
      successUrl: "s",
      cancelUrl: "c",
      providerCustomerId: "ctm_1",
    });
    expect(body).toHaveProperty("custom_data", {
      [CHECKOUT_TOKEN_KEY]: "pco_tok.sig",
      user_sub: "pco_tok.sig",
      product: "grants",
    });
  });

  it("refuses in-app webhooks when there is no webhook secret (the payments account verifies them)", async () => {
    const req = await signedRequest(
      JSON.stringify({ event_id: "evt_1", event_type: "subscription.created" }),
      undefined,
      "any-secret",
    );
    await expect(aws().parseWebhook(req)).rejects.toThrow(WebhookSignatureError);
  });
});
