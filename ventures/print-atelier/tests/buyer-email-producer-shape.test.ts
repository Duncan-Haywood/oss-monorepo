import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { POST } from "../src/app/api/stripe/webhook/route";
import {
  artworkToCheckoutLine,
  buildCheckoutSessionPayload,
} from "../src/lib/checkout";
import { catalogArtworks, type CatalogArtwork } from "../src/lib/marketplace";
import {
  clearPrintfulFulfillmentForTests,
  getPrintfulFulfillmentSubmissions,
} from "../src/lib/printful-orders";
import { clearOrdersForTests } from "../src/lib/orders";
import {
  STRIPE_API_VERSION,
  STRIPE_PAYMENT_INTENTS_ENDPOINT,
  fetchStripePaymentIntentBuyerEmail,
  type FetchLike,
} from "../src/lib/stripe-payment-intent";

/**
 * The buyer's email, on the event Stripe actually sends.
 *
 * Every other test that reaches a print partner hands the adapters a
 * `buyerEmail` key directly, or an object shaped like `{ charges: { data: [...] } }`.
 * Nothing in this venture produces either. What Stripe produces, for a Checkout
 * Session paid in `payment` mode on API version `2025-02-24.acacia`, is a
 * `payment_intent.succeeded` event whose `data.object` is an *unexpanded*
 * PaymentIntent:
 *
 *   - `receipt_email` is null — the session never set one, and it cannot: the
 *     buyer types their email into Stripe's own page after the session is
 *     created, so `payment_intent_data.receipt_email` has nothing to carry.
 *   - `customer_details` does not exist on a PaymentIntent at all; it is a
 *     Checkout Session field.
 *   - `charges` was removed from the PaymentIntent in API version 2022-11-15.
 *   - `latest_charge` is a bare charge **id string**, not the charge object.
 *
 * So all three sources `extractStripeBuyerEmail` reads miss, `resolveBuyerEmail`
 * reports `buyerEmail` missing, and both adapters record
 * `status: "blocked", canRetry: false` — after the card has been charged, and
 * behind a 200 that stops Stripe ever redelivering the event. The buyer is
 * charged, gets a Stripe receipt, and no print is ever ordered.
 *
 * These tests drive that exact producer shape through the real route. Nothing
 * here hand-builds metadata the checkout does not write, and nothing stubs a
 * module the fix lives in — the only thing replaced is `globalThis.fetch`, the
 * network itself.
 */

const WEBHOOK_SECRET = "whsec_buyer_email_secret";
const SECRET_KEY = "sk_test_buyer_email";
const PRINT_FILE = "https://files.example.test/prints/midnight-coast.tif";

/** The email the buyer typed into Stripe Checkout. It exists in exactly one place. */
const BUYER_EMAIL = "ada@example.test";

const TOUCHED_ENV = [
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "GELATO_API_KEY",
  "GELATO_STORE_ID",
  "PRINTFUL_API_KEY",
  "PRINTFUL_STORE_ID",
] as const;

const savedEnv: Record<string, string | undefined> = {};
let savedFetch: typeof globalThis.fetch;

beforeEach(() => {
  for (const key of TOUCHED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = SECRET_KEY;
  savedFetch = globalThis.fetch;
  clearPrintfulFulfillmentForTests();
  clearOrdersForTests();
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  for (const key of TOUCHED_ENV) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  clearPrintfulFulfillmentForTests();
  clearOrdersForTests();
});

function sellableArtwork(): CatalogArtwork {
  const base = catalogArtworks.find((artwork) => artwork.slug === "midnight-coast");
  assert.ok(base, "expected midnight-coast in the seeded catalog");
  return { ...base, printFileUrl: PRINT_FILE };
}

/**
 * The metadata a real checkout writes — built by the real builder from a real
 * catalog listing, not typed out here. If `buildCheckoutSessionPayload` stops
 * writing a key the adapters need, this test stops passing for that reason too.
 */
function checkoutMetadata(): Record<string, string> {
  const artworks = [sellableArtwork()];
  return buildCheckoutSessionPayload(
    [artworkToCheckoutLine(artworks[0]!, 1)],
    "US",
    "https://printatelier.test",
    {},
    artworks,
  ).metadata;
}

/**
 * The PaymentIntent as it arrives on `payment_intent.succeeded`: unexpanded,
 * `latest_charge` a string id, `receipt_email` null, `shipping` copied across
 * by Checkout from the address collection.
 */
function unexpandedPaymentIntent(id: string): Record<string, unknown> {
  return {
    id,
    object: "payment_intent",
    amount: 8500,
    currency: "usd",
    status: "succeeded",
    receipt_email: null,
    latest_charge: "ch_3QbuyerEmailTest",
    shipping: {
      name: "Ada Lovelace",
      address: {
        line1: "12 Analytical Way",
        city: "Portland",
        state: "OR",
        postal_code: "97205",
        country: "US",
      },
    },
    metadata: checkoutMetadata(),
  };
}

function paidEvent(eventId: string, paymentIntentId: string): string {
  return JSON.stringify({
    id: eventId,
    type: "payment_intent.succeeded",
    livemode: false,
    api_version: "2025-02-24.acacia",
    data: { object: unexpandedPaymentIntent(paymentIntentId) },
  });
}

function sign(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function webhookRequest(body: string): Request {
  return new Request("https://printatelier.test/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sign(body) },
    body,
  });
}

type StripeCall = { url: string; authorization: string; method: string };

/**
 * Stripe's PaymentIntent retrieve endpoint, and nothing else. Any other request
 * is a test failure rather than a silent pass — this suite must not reach a
 * print partner's API, and must not reach the real Stripe either.
 */
function stubStripe(
  respond: (call: StripeCall) => { status: number; body: string } | Error,
  calls: StripeCall[] = [],
): StripeCall[] {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers ?? {});
    const call: StripeCall = {
      url,
      authorization: headers.get("authorization") ?? "",
      method: init?.method ?? "GET",
    };
    calls.push(call);
    const outcome = respond(call);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return new Response(outcome.body, {
      status: outcome.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return calls;
}

/** The charge as Stripe returns it once `latest_charge` is expanded. */
function expandedPaymentIntentBody(id: string, email: string | null): string {
  return JSON.stringify({
    id,
    object: "payment_intent",
    amount: 8500,
    currency: "usd",
    receipt_email: null,
    latest_charge: {
      id: "ch_3QbuyerEmailTest",
      object: "charge",
      billing_details: {
        email,
        name: "Ada Lovelace",
      },
    },
  });
}

// --- the defect ----------------------------------------------------------

test("a paid order on the event Stripe really sends reaches the print partner", async () => {
  const calls = stubStripe((call) => {
    assert.ok(
      call.url.startsWith("https://api.stripe.com/v1/payment_intents/pi_buyer_email_ok"),
      `unexpected outbound request: ${call.url}`,
    );
    return { status: 200, body: expandedPaymentIntentBody("pi_buyer_email_ok", BUYER_EMAIL) };
  });

  const response = await POST(webhookRequest(paidEvent("evt_buyer_email_ok", "pi_buyer_email_ok")));
  assert.equal(response.status, 200);

  const json = (await response.json()) as Record<string, unknown>;
  assert.equal(json.orderRecorded, true);
  assert.equal(json.fulfillmentQueued, true);
  assert.notEqual(
    json.fulfillmentStatus,
    "blocked",
    "the buyer paid; a blocked submission here is an order that will never be printed",
  );

  const submissions = getPrintfulFulfillmentSubmissions();
  assert.equal(submissions.length, 1);
  const submission = submissions[0]!;
  assert.equal(submission.status, "queued");
  assert.equal(
    submission.payload.packingSlip?.email,
    BUYER_EMAIL,
    "the partner must be given the buyer's own address, read from the charge",
  );

  // The only way to get it is to ask Stripe for the charge behind the id.
  assert.equal(calls.length, 1, "expected exactly one PaymentIntent retrieval");
  assert.match(
    decodeURIComponent(calls[0]!.url),
    /expand\[\]=latest_charge/,
    "an unexpanded retrieval returns the same bare charge id the event carried",
  );
  assert.equal(calls[0]!.authorization, `Bearer ${SECRET_KEY}`);
  assert.equal(calls[0]!.method, "GET");
});

// --- boundary: the email is genuinely absent -----------------------------

test("an order whose charge carries no email is still refused, not invented", async () => {
  stubStripe(() => ({
    status: 200,
    body: expandedPaymentIntentBody("pi_buyer_email_none", null),
  }));

  const response = await POST(
    webhookRequest(paidEvent("evt_buyer_email_none", "pi_buyer_email_none")),
  );
  assert.equal(response.status, 200);

  const json = (await response.json()) as Record<string, unknown>;
  assert.equal(
    json.fulfillmentStatus,
    "blocked",
    "no email anywhere is a reason to refuse the submission, never to substitute one",
  );

  const submission = getPrintfulFulfillmentSubmissions()[0]!;
  assert.match(submission.message ?? "", /buyerEmail/);
  assert.equal(
    submission.payload.packingSlip?.email,
    "",
    "an absent email must stay absent — a studio inbox here is the buyer's receipt address",
  );
});

// --- failure: the retrieval itself fails ---------------------------------

test("a transient Stripe failure is not acknowledged as a fulfilled order", async () => {
  // 200 here would be the unrecoverable case: the submission is written
  // `blocked` with `canRetry: false`, the retry path refuses it, and Stripe
  // never redelivers the one event that could recreate it.
  const calls = stubStripe(() => ({ status: 500, body: '{"error":{"message":"boom"}}' }));

  const response = await POST(
    webhookRequest(paidEvent("evt_buyer_email_5xx", "pi_buyer_email_5xx")),
  );

  assert.equal(response.status, 503);
  const json = (await response.json()) as Record<string, unknown>;
  assert.equal(json.received, undefined, "the handler must not claim receipt");
  assert.equal(calls.length, 1);
  assert.deepEqual(
    getPrintfulFulfillmentSubmissions(),
    [],
    "no blocked-forever submission may be written while the event is still redeliverable",
  );
});

test("a network error reaching Stripe is not acknowledged either", async () => {
  stubStripe(() => new Error("ECONNRESET"));

  const response = await POST(
    webhookRequest(paidEvent("evt_buyer_email_net", "pi_buyer_email_net")),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(getPrintfulFulfillmentSubmissions(), []);
});

// --- regression: do not ask when the answer is already in hand -----------

test("a PaymentIntent that already carries receipt_email costs no Stripe call", async () => {
  const calls = stubStripe(() => {
    throw new Error("must not retrieve a PaymentIntent whose email is already present");
  });

  const body = JSON.stringify({
    id: "evt_buyer_email_direct",
    type: "payment_intent.succeeded",
    livemode: false,
    api_version: "2025-02-24.acacia",
    data: {
      object: {
        ...unexpandedPaymentIntent("pi_buyer_email_direct"),
        receipt_email: "direct@example.test",
      },
    },
  });

  const response = await POST(webhookRequest(body));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);

  const submission = getPrintfulFulfillmentSubmissions()[0]!;
  assert.equal(submission.status, "queued");
  assert.equal(submission.payload.packingSlip?.email, "direct@example.test");
});

// --- the retrieval on its own --------------------------------------------

/** A `FetchLike` that answers with one canned response and records the call. */
function cannedFetch(
  outcome: { status: number; body: string } | Error,
): { fetchFn: FetchLike; urls: string[]; headers: Array<Record<string, string>> } {
  const urls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const fetchFn: FetchLike = async (url, init) => {
    urls.push(url);
    headers.push(init?.headers ?? {});
    if (outcome instanceof Error) {
      throw outcome;
    }
    return {
      ok: outcome.status >= 200 && outcome.status < 300,
      status: outcome.status,
      text: async () => outcome.body,
    };
  };
  return { fetchFn, urls, headers };
}

test("the retrieval asks for the charge, on the version the checkout pins", async () => {
  const { fetchFn, urls, headers } = cannedFetch({
    status: 200,
    body: expandedPaymentIntentBody("pi_unit", BUYER_EMAIL),
  });

  const lookup = await fetchStripePaymentIntentBuyerEmail("pi_unit", SECRET_KEY, fetchFn);

  assert.deepEqual(lookup, { ok: true, email: BUYER_EMAIL });
  assert.equal(
    urls[0],
    `${STRIPE_PAYMENT_INTENTS_ENDPOINT}/pi_unit?expand[]=latest_charge`,
    "`expand=latest_charge` without the brackets is ignored, and returns the bare id again",
  );
  assert.equal(headers[0]?.["Stripe-Version"], STRIPE_API_VERSION);
});

test("a retrieval that finds no email reports none rather than failing", async () => {
  // `ok: true` with an empty email is not the same as a failed lookup: the
  // caller acknowledges the event and lets the adapters refuse the order. A
  // failure here would ask Stripe to redeliver an event that will never differ.
  const { fetchFn } = cannedFetch({
    status: 200,
    body: JSON.stringify({ id: "pi_unit", latest_charge: { id: "ch_1", object: "charge" } }),
  });

  assert.deepEqual(await fetchStripePaymentIntentBuyerEmail("pi_unit", SECRET_KEY, fetchFn), {
    ok: true,
    email: "",
  });
});

test("failures are classed by whether a redelivery could do better", async () => {
  const cases: Array<{ status: number; retryable: boolean }> = [
    { status: 500, retryable: true },
    { status: 503, retryable: true },
    { status: 429, retryable: true },
    // An operator can replace a rotated key inside Stripe's redelivery window.
    { status: 401, retryable: true },
    { status: 403, retryable: true },
    // These are about this request and this object, and will not change.
    { status: 400, retryable: false },
    { status: 404, retryable: false },
  ];

  for (const { status, retryable } of cases) {
    const { fetchFn } = cannedFetch({ status, body: '{"error":{}}' });
    const lookup = await fetchStripePaymentIntentBuyerEmail("pi_unit", SECRET_KEY, fetchFn);
    assert.equal(lookup.ok, false, `${status} must not resolve an email`);
    assert.equal(
      lookup.ok === false && lookup.retryable,
      retryable,
      `${status} classified wrongly`,
    );
  }
});

test("a body that is not JSON is a transient failure, not a discarded order", async () => {
  const { fetchFn } = cannedFetch({ status: 200, body: "<html>maintenance</html>" });
  const lookup = await fetchStripePaymentIntentBuyerEmail("pi_unit", SECRET_KEY, fetchFn);

  assert.equal(lookup.ok, false);
  assert.equal(lookup.ok === false && lookup.retryable, true);
});

test("no id and no key are refused without touching the network", async () => {
  for (const [id, key] of [
    ["", SECRET_KEY],
    ["   ", SECRET_KEY],
    ["pi_unit", ""],
    ["pi_unit", "   "],
  ]) {
    const { fetchFn, urls } = cannedFetch({ status: 200, body: "{}" });
    const lookup = await fetchStripePaymentIntentBuyerEmail(id!, key!, fetchFn);
    assert.equal(lookup.ok, false);
    assert.equal(lookup.ok === false && lookup.retryable, false);
    assert.deepEqual(urls, []);
  }
});

test("an event that is not a succeeded payment never reaches Stripe", async () => {
  const calls = stubStripe(() => {
    throw new Error("must not retrieve a PaymentIntent for an unrelated event");
  });

  const body = JSON.stringify({
    id: "evt_account_updated",
    type: "account.updated",
    livemode: false,
    data: { object: { id: "acct_1" } },
  });

  const response = await POST(webhookRequest(body));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
});
