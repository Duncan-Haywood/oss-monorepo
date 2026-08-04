import test from "node:test";
import assert from "node:assert/strict";
import {
  configuredSink,
  deliverOverHttp,
  normalizeEmail,
  processSubscription,
  resolveTier,
  submitSubscription,
  validateEmail,
  type DeliverToSink,
  type SubscriberSink,
  type ValidatedSubscription,
} from "./subscription.ts";

const SINK: SubscriberSink = { endpoint: "https://list.example/subscribe" };

/** A sink that always accepts, and remembers what it was handed. */
function acceptingSink() {
  const received: ValidatedSubscription[] = [];
  const deliver: DeliverToSink = async (_sink, payload) => {
    received.push(payload);
    return true;
  };
  return { deliver, received };
}

test("validateEmail accepts valid email formats", () => {
  assert.equal(validateEmail("user@example.com"), true);
  assert.equal(validateEmail("founder.jane+ai@startup.io"), true);
  assert.equal(validateEmail("researcher_123@subdomain.domain.org"), true);
});

test("validateEmail rejects invalid email formats", () => {
  assert.equal(validateEmail(""), false);
  assert.equal(validateEmail("plainaddress"), false);
  assert.equal(validateEmail("@no-username.com"), false);
  assert.equal(validateEmail("user@.com"), false);
  assert.equal(validateEmail("user@domain..com"), false);
  assert.equal(validateEmail("a".repeat(255) + "@example.com"), false);
});

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  FOUNDER@Market.com "), "founder@market.com");
});

test("an unrecognized tier falls back to the free list, never the paid one", () => {
  // Getting this backwards would put a caller on a paid waitlist by sending a
  // typo, so it is worth pinning rather than leaving to the ternary.
  assert.equal(resolveTier("premium_29"), "premium_29");
  assert.equal(resolveTier("weekly_free"), "weekly_free");
  assert.equal(resolveTier("enterprise_999"), "weekly_free");
  assert.equal(resolveTier(undefined), "weekly_free");
  assert.equal(resolveTier(null), "weekly_free");
});

test("processSubscription validates and normalizes without confirming anything", () => {
  const result = processSubscription({ email: "FOUNDER@Market.com", tier: "weekly_free" });

  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.value.email, "founder@market.com");
  assert.equal(result.value.tier, "weekly_free");
  // The point of the split: nothing here can tell a visitor they subscribed.
  assert.equal("message" in result, false);
});

test("processSubscription rejects an invalid email with a clear error", () => {
  const result = processSubscription({ email: "not-an-email", tier: "premium_29" });

  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.outcome.status, "invalid_email");
  assert.equal(result.outcome.httpStatus, 400);
  assert.equal(result.outcome.error, "INVALID_EMAIL");
});

test("an invalid email is rejected before the sink is ever called", async () => {
  let called = false;
  const outcome = await submitSubscription(
    { email: "not-an-email", tier: "weekly_free" },
    {
      sink: SINK,
      deliver: async () => {
        called = true;
        return true;
      },
    },
  );

  assert.equal(outcome.status, "invalid_email");
  assert.equal(called, false, "a malformed address must not be forwarded anywhere");
});

test("with no sink configured, a signup is refused rather than confirmed", async () => {
  // This is the case the venture is actually in today, and the one that used to
  // answer "Check your inbox" while dropping the address on the floor.
  const outcome = await submitSubscription(
    { email: "founder@market.com", tier: "weekly_free" },
    { sink: null, deliver: async () => true },
  );

  assert.equal(outcome.status, "not_configured");
  assert.equal(outcome.httpStatus, 501);
  assert.ok(outcome.status === "not_configured");
  assert.match(outcome.operatorAction, /SUBSCRIBER_WEBHOOK_URL/);
  assert.match(
    outcome.message,
    /haven't kept it/,
    "the visitor has to be told their address was not kept",
  );
});

test("no unconfirmed outcome ever tells the visitor they are subscribed", async () => {
  // The regression that matters is a message, not a status code: a 501 whose
  // body still reads "you're on the list" is the same lie with a new number.
  const refusals = [
    await submitSubscription(
      { email: "founder@market.com", tier: "weekly_free" },
      { sink: null, deliver: async () => true },
    ),
    await submitSubscription(
      { email: "founder@market.com", tier: "premium_29" },
      { sink: SINK, deliver: async () => false },
    ),
    await submitSubscription(
      { email: "nope", tier: "weekly_free" },
      { sink: SINK, deliver: async () => true },
    ),
  ];

  for (const outcome of refusals) {
    assert.notEqual(outcome.status, "recorded");
    assert.doesNotMatch(
      outcome.message,
      /you're on the (list|waitlist)|check your (inbox|email)|welcome to|subscribed/i,
      `a ${outcome.status} outcome must not read as a confirmation: ${outcome.message}`,
    );
  }
});

test("a sink that refuses the address is reported as a failure, not a success", async () => {
  const outcome = await submitSubscription(
    { email: "founder@market.com", tier: "weekly_free" },
    { sink: SINK, deliver: async () => false },
  );

  assert.equal(outcome.status, "sink_failed");
  assert.equal(outcome.httpStatus, 502);
});

test("a sink that throws is a failure, not an exception out of the route", async () => {
  const outcome = await submitSubscription(
    { email: "founder@market.com", tier: "weekly_free" },
    {
      sink: SINK,
      deliver: async () => {
        throw new Error("network down");
      },
    },
  );

  assert.equal(outcome.status, "sink_failed");
  assert.equal(outcome.httpStatus, 502);
});

test("a recorded signup hands the normalized address to the sink", async () => {
  const { deliver, received } = acceptingSink();
  const outcome = await submitSubscription(
    { email: "  FOUNDER@Market.com ", tier: "weekly_free", interestSector: "  devtools " },
    { sink: SINK, deliver, now: () => new Date("2026-08-01T00:00:00.000Z") },
  );

  assert.equal(outcome.status, "recorded");
  assert.ok(outcome.status === "recorded");
  assert.equal(outcome.data.email, "founder@market.com");
  assert.equal(outcome.data.subscribedAt, "2026-08-01T00:00:00.000Z");
  assert.deepEqual(received, [
    { email: "founder@market.com", tier: "weekly_free", interestSector: "devtools" },
  ]);
});

test("the free tier confirmation promises only what the free list does", async () => {
  const { deliver } = acceptingSink();
  const outcome = await submitSubscription(
    { email: "founder@market.com", tier: "weekly_free" },
    { sink: SINK, deliver },
  );

  assert.ok(outcome.status === "recorded");
  assert.match(outcome.message, /Weekly Market Intelligence/);
});

test("the premium tier is a waitlist and says so, including that nothing was charged", async () => {
  // There is no payment path in this venture. Copy that reads as a completed
  // purchase — "Welcome to Premium", "Subscription Received" — is a claim about
  // a transaction that did not happen.
  const { deliver } = acceptingSink();
  const outcome = await submitSubscription(
    { email: "investor@venture.co", tier: "premium_29" },
    { sink: SINK, deliver },
  );

  assert.ok(outcome.status === "recorded");
  assert.match(outcome.message, /waitlist/i);
  assert.match(outcome.message, /not been charged/i);
  assert.doesNotMatch(
    outcome.message,
    /welcome to|your subscription is active|thanks for your purchase/i,
    "the premium message must not read as a completed purchase",
  );
});

test("configuredSink reads the sink out of the environment and treats blank as absent", () => {
  assert.equal(configuredSink({}), null);
  assert.equal(configuredSink({ SUBSCRIBER_WEBHOOK_URL: "   " }), null);
  assert.deepEqual(configuredSink({ SUBSCRIBER_WEBHOOK_URL: " https://list.example/x " }), {
    endpoint: "https://list.example/x",
    token: undefined,
  });
  assert.deepEqual(
    configuredSink({
      SUBSCRIBER_WEBHOOK_URL: "https://list.example/x",
      SUBSCRIBER_WEBHOOK_TOKEN: "s3cret",
    }),
    { endpoint: "https://list.example/x", token: "s3cret" },
  );
});

test("deliverOverHttp posts the signup and reports a non-2xx as a failure", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: calls.length === 1 } as Response;
  }) as typeof fetch;

  try {
    const payload: ValidatedSubscription = { email: "founder@market.com", tier: "weekly_free" };
    assert.equal(await deliverOverHttp({ ...SINK, token: "s3cret" }, payload), true);
    assert.equal(await deliverOverHttp(SINK, payload), false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].url, SINK.endpoint);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer s3cret",
    "a configured token must authenticate the call to the list provider",
  );
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    email: "founder@market.com",
    tier: "weekly_free",
  });
  // No token configured means no Authorization header at all, rather than
  // "Bearer undefined".
  assert.equal(
    (calls[1].init.headers as Record<string, string>).Authorization,
    undefined,
  );
});
