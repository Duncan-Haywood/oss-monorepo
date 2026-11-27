import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKOUT_TOKEN_KEY } from "./checkout-token.ts";
import { hmacSha256Hex, PromoCodeError, WebhookSignatureError } from "./crypto.ts";
import {
  PaddleBillingProvider,
  paddleBaseUrl,
  paddleSubscriptionPrice,
  signPaddleWebhook,
  verifyPaddleSignature,
} from "./paddle.ts";

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

function provider(fetchFn?: typeof fetch, planKeys?: readonly string[]) {
  return new PaddleBillingProvider({
    apiKey: "pdl_sdbx_apikey_test",
    webhookSecret: SECRET,
    priceIds: {
      starter: "pri_st_m",
      "starter:annual": "pri_st_y",
      standard: "pri_std_m",
      comp: "pri_comp",
    },
    planKeys,
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
    assert.equal(ev.providerEventId, "evt_01");
    assert.deepEqual(ev.occurredAt, new Date("2026-11-19T00:00:00Z"));
    assert.equal(ev.providerSubscriptionId, "sub_01");
    // Only the opaque token is surfaced; custom_data.orgId is never exposed as an org binding.
    assert.equal(ev.checkoutToken, "pco_token.sig");
    assert.ok(!("orgId" in ev));
    assert.deepEqual(ev.subscription, {
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
    await assert.rejects(
      p.parseWebhook(await signedRequest(body, undefined, "wrong")),
      WebhookSignatureError,
    );
    const req = await signedRequest(body);
    const tampered = new Request(req.url, {
      method: "POST",
      body: body.replace("standard", "pro"),
      headers: req.headers,
    });
    await assert.rejects(p.parseWebhook(tampered), WebhookSignatureError);
    await assert.rejects(
      p.parseWebhook(await signedRequest(body, Math.floor(NOW / 1000) - 3600)),
      /Stale/,
    );
    await assert.rejects(
      p.parseWebhook(new Request("https://app.test/x", { method: "POST", body })),
      /Missing/,
    );
  });

  it("accepts any matching h1 (secret rotation) and rejects malformed headers", async () => {
    const body = "{}";
    const ts = Math.floor(NOW / 1000);
    const good = await signPaddleWebhook(body, SECRET, ts);
    const rotated = `ts=${ts};h1=${"0".repeat(64)};${good.split(";")[1]}`;
    await verifyPaddleSignature(rotated, body, SECRET, { nowMs: NOW });
    for (const bad of ["", "h1=abc", `ts=abc;h1=${"0".repeat(64)}`, `ts=${ts}`]) {
      await assert.rejects(
        verifyPaddleSignature(bad, body, SECRET, { nowMs: NOW }),
        WebhookSignatureError,
      );
    }
  });

  it("ignores a crafted custom_data.orgId and reads subscription_id on transaction events", () => {
    const crafted = provider().normalize({
      event_id: "evt_02",
      event_type: "transaction.completed",
      occurred_at: "2026-11-19T00:00:01Z",
      data: { id: "txn_1", subscription_id: "sub_01", custom_data: { orgId: "org_victim" } },
    });
    assert.equal(crafted.checkoutToken, null);
    assert.equal(crafted.providerSubscriptionId, "sub_01");
    assert.equal(crafted.subscription, undefined);
    assert.doesNotMatch(JSON.stringify({ ...crafted, raw: null }), /org_victim/);
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
    assert.equal(ev.subscription?.planKey, "starter");
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
    assert.equal(escalated.subscription?.planKey, "starter");
    // Unknown price: no subscription data at all (ignored), even with a plan in custom_data.
    const unknownPrice = provider().normalize({
      ...subscriptionEvent,
      data: {
        ...subscriptionEvent.data,
        custom_data: { orgId: "org_abc", planKey: "pro" },
        items: [{ price: { id: "pri_attacker" } }],
      },
    });
    assert.equal(unknownPrice.subscription, undefined);
  });

  it("with planKeys, a price mapped to a non-purchasable plan yields no subscription", () => {
    const ev = provider(undefined, ["starter", "standard"]).normalize({
      ...subscriptionEvent,
      data: { ...subscriptionEvent.data, items: [{ price: { id: "pri_comp" } }] },
    });
    assert.equal(ev.subscription, undefined);
  });
});

describe("paddleSubscriptionPrice (MRR source)", () => {
  const item = {
    quantity: 2,
    price: {
      id: "pri_std_m",
      unit_price: { amount: "2900", currency_code: "usd" },
      billing_cycle: { interval: "month", frequency: 1 },
    },
  };

  it("records the billed unit price, cycle and quantity exactly as the webhook carries them", () => {
    assert.deepEqual(paddleSubscriptionPrice(item, null), {
      unitAmountMinor: 2900,
      currency: "USD",
      interval: "month",
      frequency: 1,
      quantity: 2,
      discounted: false,
    });
    assert.equal(paddleSubscriptionPrice(item, { id: "dsc_1" })?.discounted, true);
  });

  it("returns null when any part is missing or malformed (never a guessed price)", () => {
    const bad = [
      { ...item, price: { ...item.price, unit_price: { amount: "29.00", currency_code: "USD" } } },
      { ...item, price: { ...item.price, unit_price: { amount: "2900" } } },
      { ...item, price: { ...item.price, billing_cycle: { interval: "fortnight", frequency: 1 } } },
      { ...item, price: { ...item.price, billing_cycle: { interval: "month" } } },
      { ...item, quantity: -1 },
      { price: { id: "pri_std_m" } },
      null,
    ];
    for (const b of bad) assert.equal(paddleSubscriptionPrice(b, null), null);
  });

  it("normalize() attaches the price to the subscription", () => {
    const ev = provider().normalize({
      ...subscriptionEvent,
      data: { ...subscriptionEvent.data, items: [item] },
    });
    assert.equal(ev.subscription?.price?.unitAmountMinor, 2900);
    const noPrice = provider().normalize(subscriptionEvent);
    assert.equal(noPrice.subscription?.price, undefined);
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
    assert.equal(res.url, "https://pay.example/?_ptxn=txn_1");
    const txn = calls.find((c) => c.url.endsWith("/transactions"));
    assert.equal(txn && new URL(txn.url).host, "sandbox-api.paddle.com");
    assert.deepEqual(txn?.body, {
      items: [{ price_id: "pri_st_y", quantity: 1 }],
      customer_id: "ctm_new",
      discount_id: "dsc_1",
      collection_mode: "automatic",
      custom_data: { [CHECKOUT_TOKEN_KEY]: "pco_tok.sig" },
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
    assert.equal(
      urls.some((u) => u.includes("/customers")),
      false,
    );
    assert.equal((body as { customer_id?: string }).customer_id, "ctm_existing");
  });

  it("throws PromoCodeError for unknown codes and a clear error for unpriced plans", async () => {
    const fetchFn: typeof fetch = async (input) =>
      String(input).includes("/customers")
        ? Response.json({ data: [{ id: "ctm_1" }] })
        : Response.json({ data: [] });
    const req = {
      checkoutToken: "pco_tok.sig",
      planKey: "starter",
      customerEmail: "a@b.c",
      successUrl: "s",
      cancelUrl: "c",
    };
    await assert.rejects(
      provider(fetchFn).createCheckout({ ...req, promoCode: "NOPE" }),
      PromoCodeError,
    );
    await assert.rejects(
      provider(fetchFn).createCheckout({ ...req, planKey: "pro" }),
      /no price id configured for pro/,
    );
  });

  it("surfaces API errors without echoing the query string", async () => {
    const fetchFn: typeof fetch = async () =>
      Response.json({ error: { code: "forbidden" } }, { status: 403 });
    await assert.rejects(
      provider(fetchFn).createCheckout({
        checkoutToken: "t",
        planKey: "starter",
        customerEmail: "secret@example.org",
        successUrl: "s",
        cancelUrl: "c",
      }),
      /^Error: Paddle GET \/customers failed: 403 forbidden$/,
    );
  });

  it("creates portal sessions", async () => {
    const fetchFn: typeof fetch = async (input) => {
      assert.match(String(input), /\/customers\/ctm_1\/portal-sessions$/);
      return Response.json({ data: { urls: { general: { overview: "https://portal/x" } } } });
    };
    assert.deepEqual(await provider(fetchFn).createPortalSession("ctm_1", "https://app/r"), {
      url: "https://portal/x",
    });
  });

  it("infers sandbox vs live from the key prefix", () => {
    assert.equal(paddleBaseUrl("pdl_sdbx_apikey_x"), "https://sandbox-api.paddle.com");
    assert.equal(paddleBaseUrl("pdl_live_apikey_x"), "https://api.paddle.com");
  });
});

describe("PaddleBillingProvider.chargeUsage", () => {
  const req = {
    providerSubscriptionId: "sub_01",
    planKey: "standard",
    amountMinor: 1234,
    currency: "EUR",
    name: "API usage 2026-11",
    description: "einvoice api usage above the monthly minimum, 2026-11",
  };

  it("files a non-catalog price on the plan's product, billed with the next renewal", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        method: init?.method ?? "GET",
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.endsWith("/prices/pri_std_m"))
        return Response.json({ data: { id: "pri_std_m", product_id: "pro_std" } });
      if (url.endsWith("/subscriptions/sub_01/charge"))
        return Response.json({ data: { id: "sub_01" } });
      return new Response("{}", { status: 404 });
    };
    assert.deepEqual(await provider(fetchFn).chargeUsage(req), { chargeId: null });
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url}`),
      [
        "GET https://sandbox-api.paddle.com/prices/pri_std_m",
        "POST https://sandbox-api.paddle.com/subscriptions/sub_01/charge",
      ],
    );
    assert.deepEqual(calls[1]?.body, {
      effective_from: "next_billing_period",
      items: [
        {
          quantity: 1,
          price: {
            product_id: "pro_std",
            name: "API usage 2026-11",
            description: "einvoice api usage above the monthly minimum, 2026-11",
            tax_mode: "account_setting",
            unit_price: { amount: "1234", currency_code: "EUR" },
          },
        },
      ],
    });
  });

  it("refuses bad amounts, unknown plans and a price without a product, before any charge", async () => {
    const posts: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      if (init?.method === "POST") posts.push(String(input));
      return Response.json({ data: { id: "pri_std_m" } });
    };
    const p = provider(fetchFn);
    await assert.rejects(p.chargeUsage({ ...req, amountMinor: 0 }), /positive whole amount/);
    await assert.rejects(p.chargeUsage({ ...req, amountMinor: 12.5 }), /positive whole amount/);
    await assert.rejects(p.chargeUsage({ ...req, currency: "eur" }), /ISO 4217/);
    await assert.rejects(
      p.chargeUsage({ ...req, planKey: "nope" }),
      /no price id configured for nope/,
    );
    await assert.rejects(p.chargeUsage(req), /has no product/);
    assert.deepEqual(posts, []);
  });

  it("reports a refused charge (e.g. a past_due subscription) without echoing the request", async () => {
    const fetchFn: typeof fetch = async (input) =>
      String(input).includes("/prices/")
        ? Response.json({ data: { product_id: "pro_std" } })
        : Response.json({ error: { code: "subscription_locked_past_due" } }, { status: 400 });
    await assert.rejects(
      provider(fetchFn).chargeUsage(req),
      /^Error: Paddle POST \/subscriptions\/sub_01\/charge failed: 400 subscription_locked_past_due$/,
    );
  });
});
