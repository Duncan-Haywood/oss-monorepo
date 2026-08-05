import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { POST } from "../src/app/api/stripe/webhook/route";

/**
 * `stripe-webhook.test.ts` covers `verifyStripeWebhookSignature` as a pure
 * function, but nothing exercised the route that money actually arrives on.
 * Signature rejection being correct in isolation does not prove the handler
 * returns 400 rather than proceeding, which is the property that matters: this
 * endpoint creates order records and queues real Gelato/Printful fulfillment.
 */

const WEBHOOK_SECRET = "whsec_test_secret";

const TOUCHED_ENV = [
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "GELATO_API_KEY",
  "GELATO_STORE_ID",
  "PRINTFUL_API_KEY",
  "PRINTFUL_STORE_ID",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of TOUCHED_ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
});

afterEach(() => {
  for (const key of TOUCHED_ENV) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

/** Builds the `t=<ts>,v1=<hmac>` header Stripe sends, for an arbitrary secret. */
function sign(
  payload: string,
  secret = WEBHOOK_SECRET,
  timestamp = Math.floor(Date.now() / 1000).toString(),
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function request(body: string, signature: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) {
    headers["stripe-signature"] = signature;
  }
  return new Request("https://printatelier.com/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

// --- authenticity --------------------------------------------------------

test("refuses a payload with no signature header", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "account.updated", data: { object: {} } });
  const response = await POST(request(body, null));
  assert.equal(response.status, 400);
});

test("refuses a forged signature", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "account.updated", data: { object: {} } });
  const response = await POST(request(body, "t=1710000000,v1=deadbeef"));
  assert.equal(response.status, 400);
});

test("refuses a signature computed with the wrong secret", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "account.updated", data: { object: {} } });
  const response = await POST(request(body, sign(body, "whsec_attacker_secret")));
  assert.equal(response.status, 400);
});

test("refuses a valid signature bound to a different payload", async () => {
  // Replaying a genuine signature over swapped contents must not authenticate.
  const signed = JSON.stringify({ id: "evt_1", type: "account.updated", data: { object: {} } });
  const tampered = JSON.stringify({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { amount: 999999 } },
  });
  const response = await POST(request(tampered, sign(signed)));
  assert.equal(response.status, 400);
});

test("refuses a genuinely signed payload that is too old to be live", async () => {
  // The captured-webhook replay. The signature is real — computed with the
  // real secret over the real body — but the event is from March 2024. The
  // route must reject it on the timestamp alone, because a 200 here records
  // an order and queues real print fulfillment for a payment that already
  // happened. This is the property the `maxAgeSeconds = 0` default removed:
  // the check ran only because this one call site passed a window.
  const body = JSON.stringify({
    id: "evt_replayed",
    type: "payment_intent.succeeded",
    data: { object: { amount: 24900, metadata: {} } },
  });
  const response = await POST(request(body, sign(body, WEBHOOK_SECRET, "1710000000")));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Invalid Stripe webhook signature");
});

test("fails closed when no webhook secret is configured", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const body = JSON.stringify({ id: "evt_1", type: "account.updated", data: { object: {} } });
  const response = await POST(request(body, sign(body)));
  assert.equal(response.status, 503);
});

// --- payload shape -------------------------------------------------------

test("rejects a correctly signed payload that is not JSON", async () => {
  const body = "{not json";
  const response = await POST(request(body, sign(body)));
  assert.equal(response.status, 400);
});

test("rejects a correctly signed event that omits `data` instead of crashing", async () => {
  // Regression: the handler read `event.data.object` unguarded, so a signed
  // event without `data` raised a TypeError and surfaced as a 500. Stripe
  // retries 5xx, so a malformed event would be redelivered indefinitely.
  const body = JSON.stringify({ id: "evt_1", type: "account.updated" });
  const response = await POST(request(body, sign(body)));
  assert.equal(response.status, 400);
});

test("rejects a correctly signed event whose body is not an object", async () => {
  for (const body of ["[]", '"a string"', "42", "null"]) {
    const response = await POST(request(body, sign(body)));
    assert.equal(response.status, 400, `expected 400 for body ${body}`);
  }
});

// --- the legitimate path still works -------------------------------------

test("accepts a correctly signed event", async () => {
  const body = JSON.stringify({
    id: "evt_ok",
    type: "account.updated",
    livemode: false,
    data: { object: { id: "acct_1" } },
  });
  const response = await POST(request(body, sign(body)));
  assert.equal(response.status, 200);

  const payload = (await response.json()) as { received: boolean };
  assert.equal(payload.received, true);
});
