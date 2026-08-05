import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getStripeWebhookEnvStatus,
  processStripeConnectWebhookEvent,
} from "../src/lib/stripe-connect.ts";
import {
  STRIPE_WEBHOOK_MAX_AGE_SECONDS,
  verifyStripeWebhookSignature,
} from "../src/lib/stripe-webhook-server.ts";

test("getStripeWebhookEnvStatus reports missing Stripe credentials", () => {
  const status = getStripeWebhookEnvStatus({});

  assert.equal(status.readyForTestMode, false);
  assert.equal(status.blockers.length, 3);
});

test("getStripeWebhookEnvStatus passes when test-mode env vars are present", () => {
  const status = getStripeWebhookEnvStatus({
    STRIPE_SECRET_KEY: "sk_test_abc",
    STRIPE_WEBHOOK_SECRET: "whsec_abc",
    STRIPE_CONNECT_CLIENT_ID: "ca_abc",
  });

  assert.equal(status.readyForTestMode, true);
  assert.equal(status.blockers.length, 0);
});

test("processStripeConnectWebhookEvent handles transfer.created", () => {
  const result = processStripeConnectWebhookEvent({
    id: "evt_1",
    type: "transfer.created",
    created: 1710000000,
    livemode: false,
    data: {
      object: {
        amount: 1250,
        destination: "acct_artist_1",
      },
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.artistAccountId, "acct_artist_1");
  assert.equal(result.amountCents, 1250);
  assert.equal(result.testMode, true);
});

const WEBHOOK_SECRET = "whsec_test_secret";
const WEBHOOK_PAYLOAD = JSON.stringify({ id: "evt_test", type: "transfer.created" });

/** Builds the `t=<ts>,v1=<hmac>` header Stripe sends for a given timestamp. */
function signedHeader(timestamp: number, secret = WEBHOOK_SECRET, payload = WEBHOOK_PAYLOAD) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test("verifyStripeWebhookSignature validates Stripe signature headers", () => {
  const timestamp = 1710000000;
  const header = signedHeader(timestamp);

  // `nowSeconds` is pinned beside the timestamp so this test measures the HMAC
  // and nothing else. Age is the subject of the tests below.
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, header, WEBHOOK_SECRET, 300, timestamp),
    true,
  );
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, "t=1,v1=bad", WEBHOOK_SECRET, 300, 1),
    false,
  );
});

test("verifyStripeWebhookSignature rejects expired signatures when maxAgeSeconds is set", () => {
  const oldTimestamp = 1710000000;
  const header = signedHeader(oldTimestamp);

  const currentNow = oldTimestamp + 600; // 10 minutes later (max age 300s)
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, header, WEBHOOK_SECRET, 300, currentNow),
    false,
  );
  assert.equal(
    verifyStripeWebhookSignature(
      WEBHOOK_PAYLOAD,
      header,
      WEBHOOK_SECRET,
      300,
      oldTimestamp + 100,
    ),
    true,
  );
});

/**
 * The replay guard's default used to be `maxAgeSeconds = 0`, and the body read
 * `if (maxAgeSeconds > 0 && ...)`. The route passed `300` so the deployed path
 * was safe, but the *default* on the function that authenticates money was
 * "no replay protection" — a new call site, or dropping the argument from the
 * existing one, would have switched the check off with every line still
 * reading as correct.
 *
 * These four tests are the mutation surface. Reverting the signature to
 * `maxAgeSeconds = 0` fails the first; reverting the body to the
 * `maxAgeSeconds > 0 &&` bypass fails the second; removing the ceiling fails
 * the third and fourth.
 */
test("the default replay window rejects a stale signature with no argument passed", () => {
  const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // an hour old
  const header = signedHeader(staleTimestamp);

  // Deliberately a 3-argument call: this is what a new call site that does not
  // know about the tolerance looks like. The HMAC is genuine, so the only
  // thing that can reject it is the age check running by default.
  assert.equal(verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, header, WEBHOOK_SECRET), false);

  // ... and the default still accepts a live delivery, so the guard is not
  // passing by simply rejecting everything.
  const freshTimestamp = Math.floor(Date.now() / 1000);
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, signedHeader(freshTimestamp), WEBHOOK_SECRET),
    true,
  );
});

test("a non-positive or non-finite tolerance fails closed rather than disabling the check", () => {
  const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
  const header = signedHeader(staleTimestamp);
  const freshHeader = signedHeader(Math.floor(Date.now() / 1000));

  // `0` was the old "skip the age check" sentinel. It is now out of range, and
  // out of range means reject — including for an otherwise-valid live
  // delivery, so a caller cannot quietly keep the old meaning.
  for (const tolerance of [0, -1, -300, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, header, WEBHOOK_SECRET, tolerance),
      false,
      `stale signature accepted at tolerance ${tolerance}`,
    );
    assert.equal(
      verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, freshHeader, WEBHOOK_SECRET, tolerance),
      false,
      `out-of-range tolerance ${tolerance} was treated as usable`,
    );
  }
});

test("a call site cannot argue the replay window wider than the declared ceiling", () => {
  const dayOldTimestamp = Math.floor(Date.now() / 1000) - 86400;
  const header = signedHeader(dayOldTimestamp);

  // A caller asking for a day-wide window does not get one. It does not get a
  // clamped 300s window either — an out-of-range tolerance is a configuration
  // error on the money path, and it is refused.
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, header, WEBHOOK_SECRET, 86400),
    false,
  );
  assert.equal(
    verifyStripeWebhookSignature(
      WEBHOOK_PAYLOAD,
      header,
      WEBHOOK_SECRET,
      STRIPE_WEBHOOK_MAX_AGE_SECONDS + 1,
    ),
    false,
  );

  // Narrowing is always allowed — that direction is a strengthening.
  const recentTimestamp = Math.floor(Date.now() / 1000) - 30;
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, signedHeader(recentTimestamp), WEBHOOK_SECRET, 60),
    true,
  );
  assert.equal(
    verifyStripeWebhookSignature(WEBHOOK_PAYLOAD, signedHeader(recentTimestamp), WEBHOOK_SECRET, 10),
    false,
  );
});

/**
 * The stand-in for a cap watch. `scripts/ci/cap_ratchet.py` holds every
 * declared budget in this repository to the lowest value it has ever held, but
 * it only understands `python-constant` and `yaml-path` watches — a TypeScript
 * constant under `ventures/` is reachable by none of its kinds, so this
 * number is watched by nothing outside this venture's own suite.
 *
 * This test is that watch: the accepted replay window is bounded above, and
 * raising `STRIPE_WEBHOOK_MAX_AGE_SECONDS` past Stripe's own documented
 * tolerance turns it red. It is a bound, not a ratchet — nothing here reads
 * git history — so lowering the constant is silently allowed, which is the
 * safe direction.
 */
test("the accepted replay window is bounded", () => {
  assert.ok(
    Number.isInteger(STRIPE_WEBHOOK_MAX_AGE_SECONDS),
    "the replay window must be a whole number of seconds",
  );
  assert.ok(
    STRIPE_WEBHOOK_MAX_AGE_SECONDS > 0,
    "a replay window of zero or less would disable the guard",
  );
  assert.ok(
    STRIPE_WEBHOOK_MAX_AGE_SECONDS <= 300,
    `the replay window may not be argued above Stripe's own 300s tolerance ` +
      `(found ${STRIPE_WEBHOOK_MAX_AGE_SECONDS}). Widening it is what this test exists to refuse.`,
  );
});

/**
 * The route is the only call site, and it is the one that records paid orders
 * and queues Gelato/Printful fulfillment. Assert against its source rather
 * than mocking the verifier: a route test that stubs
 * `stripe-webhook-server` would stay green with the guard reverted, which is
 * the failure mode this whole file is guarding against.
 */
test("the Stripe webhook route passes a bounded tolerance, not a literal", () => {
  const routeSource = readFileSync(
    new URL("../src/app/api/stripe/webhook/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    routeSource,
    /verifyStripeWebhookSignature\(\s*payload,\s*signature,\s*webhookSecret,\s*STRIPE_WEBHOOK_MAX_AGE_SECONDS,?\s*\)/,
    "the webhook route must pass STRIPE_WEBHOOK_MAX_AGE_SECONDS, so there is one number to audit",
  );
});


/**
 * The other fail-open default in this verifier's contract, found while fixing
 * the tolerance: `createHmac` accepts `""` as a key and returns a digest keyed
 * on nothing, so a blank secret would authenticate a payload anyone could
 * sign. The current route is not exposed — it requires a `whsec_` prefix and
 * 503s otherwise — so this is defence in depth for the next call site, which
 * is precisely the risk the tolerance default demonstrated is real.
 */
test("verifyStripeWebhookSignature refuses to authenticate against a blank secret", () => {
  const payload = JSON.stringify({ id: "evt_blank", type: "payment_intent.succeeded" });
  const now = 1710000000;

  for (const blank of ["", "   ", "\t\n"]) {
    // The header an attacker would send: a genuine HMAC under the blank key.
    const digest = createHmac("sha256", blank).update(`${now}.${payload}`, "utf8").digest("hex");

    assert.equal(
      verifyStripeWebhookSignature(payload, `t=${now},v1=${digest}`, blank, 300, now),
      false,
      `a blank secret (${JSON.stringify(blank)}) must never verify, even against its own digest`,
    );
  }

  // A real secret still verifies — the guard rejects blank keys, not all keys.
  const secret = "whsec_test_secret";
  const good = createHmac("sha256", secret).update(`${now}.${payload}`, "utf8").digest("hex");
  assert.equal(
    verifyStripeWebhookSignature(payload, `t=${now},v1=${good}`, secret, 300, now),
    true,
  );
});
