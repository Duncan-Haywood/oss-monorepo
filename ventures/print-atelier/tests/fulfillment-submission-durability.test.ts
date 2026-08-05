import assert from "node:assert/strict";
import test from "node:test";

import {
  FulfillmentSubmissionStoreCapacityExceededError,
  IN_MEMORY_FULFILLMENT_STORE_CAPACITY,
  createInMemoryFulfillmentSubmissionStore,
  describeFulfillmentRecordCompleteness,
} from "../src/lib/fulfillment-submission-store";
import { buildFulfillmentSubmissionSummary } from "../src/lib/fulfillment-submissions";
import {
  clearGelatoFulfillmentForTests,
  getGelatoFulfillmentStoreDescriptor,
  getGelatoFulfillmentSubmissions,
  recordGelatoFulfillmentSubmission,
  type GelatoOrderSubmission,
} from "../src/lib/gelato-orders";
import {
  clearPrintfulFulfillmentForTests,
  getPrintfulFulfillmentStoreDescriptor,
  getPrintfulFulfillmentSubmissions,
  getPrintfulRetryQueue,
  recordPrintfulFulfillmentSubmission,
  retryPrintfulFulfillmentSubmission,
  type PrintfulOrderSubmission,
} from "../src/lib/printful-orders";

/**
 * Both partner stores used to end their record function with
 * `fulfillmentStore.length = 50`.
 *
 * The submission is the only record that a paid order's fulfillment was
 * attempted, and — when `status: "blocked"` — the only thing that will ever tell
 * an operator that a buyer paid and no print was made. It holds the recipient
 * address and the print file URL, which are not stored anywhere else once the
 * Stripe event is acknowledged.
 *
 * The eviction therefore did operational work, not display work, and it did the
 * worst possible version of it: `buildFulfillmentSubmissionSummary` derives
 * `blockedCount`, the blocker string, and `fulfillmentReady` from the same
 * window. Dropping a blocked submission removes the record *and* clears the
 * alarm that would have surfaced it, so the operator panel reports fulfillment
 * healthy exactly because the evidence is gone.
 *
 * The tests below are written so that reintroducing the truncation fails them.
 * The `fulfillmentReady` assertion is the one that matters most: a test that
 * only counted records would stay green while the alarm-clearing behaviour came
 * back with a different bound.
 */

function blockedPrintfulSubmission(orderId: string): PrintfulOrderSubmission {
  return {
    orderId,
    partner: "printful",
    mode: "dry_run",
    status: "blocked",
    apiEndpoint: "https://api.printful.com/orders",
    payload: {
      external_id: orderId,
      recipient: {
        name: "Test Buyer",
        address1: "1 Test Street",
        city: "Testville",
        state_code: "CA",
        country_code: "US",
        zip: "90210",
        email: "buyer@example.test",
      },
      items: [],
    } as unknown as PrintfulOrderSubmission["payload"],
    message: `Order inputs incomplete for ${orderId}`,
    retryCount: 0,
    maxRetries: 3,
    canRetry: true,
  };
}

function submittedPrintfulSubmission(orderId: string): PrintfulOrderSubmission {
  return { ...blockedPrintfulSubmission(orderId), status: "submitted", canRetry: false };
}

function blockedGelatoSubmission(orderId: string): GelatoOrderSubmission {
  return {
    orderId,
    partner: "gelato",
    mode: "dry_run",
    status: "blocked",
    apiEndpoint: "https://order.gelatoapis.com/v4/orders",
    payload: {} as unknown as GelatoOrderSubmission["payload"],
    message: `Order inputs incomplete for ${orderId}`,
  };
}

test("a blocked printful submission survives far past the old cap of 50", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  const first = blockedPrintfulSubmission("ord_first");
  recordPrintfulFulfillmentSubmission(first);
  for (let index = 0; index < 200; index += 1) {
    recordPrintfulFulfillmentSubmission(submittedPrintfulSubmission(`ord_filler_${index}`));
  }

  const stored = getPrintfulFulfillmentSubmissions();
  assert.equal(stored.length, 201, "every submission must still exist; none may be evicted");
  assert.ok(
    stored.some((item) => item.orderId === "ord_first"),
    "the oldest blocked submission is the one the old truncation destroyed first",
  );
});

test("eviction cannot clear its own alarm — fulfillmentReady stays false", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  recordPrintfulFulfillmentSubmission(blockedPrintfulSubmission("ord_blocked"));
  for (let index = 0; index < 200; index += 1) {
    recordPrintfulFulfillmentSubmission(submittedPrintfulSubmission(`ord_ok_${index}`));
  }

  const summary = buildFulfillmentSubmissionSummary();
  assert.equal(summary.blockedCount, 1, "the blocked order must still be counted");
  assert.equal(
    summary.fulfillmentReady,
    false,
    "a buyer paid and no print was made; the panel must not report fulfillment healthy",
  );
  assert.ok(
    summary.blockers.some((blocker) => blocker.includes("blocked by fulfillment API errors")),
    "the blocker naming the blocked submission must survive the newer submissions",
  );
});

test("the same guarantee holds for gelato", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  recordGelatoFulfillmentSubmission(blockedGelatoSubmission("ord_gelato_blocked"));
  for (let index = 0; index < 200; index += 1) {
    recordGelatoFulfillmentSubmission({
      ...blockedGelatoSubmission(`ord_gelato_ok_${index}`),
      status: "submitted",
    });
  }

  assert.equal(getGelatoFulfillmentSubmissions().length, 201);
  const summary = buildFulfillmentSubmissionSummary();
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.fulfillmentReady, false);
});

test("a retry still finds a submission recorded long ago", async () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  recordPrintfulFulfillmentSubmission(blockedPrintfulSubmission("ord_retryable"));
  for (let index = 0; index < 200; index += 1) {
    recordPrintfulFulfillmentSubmission(submittedPrintfulSubmission(`ord_noise_${index}`));
  }

  assert.ok(
    getPrintfulRetryQueue().some((item) => item.orderId === "ord_retryable"),
    "the retry queue reads the store; an evicted submission is silently unretryable",
  );
  const retried = await retryPrintfulFulfillmentSubmission("ord_retryable");
  assert.notEqual(
    retried,
    null,
    "an evicted submission makes retry return null — indistinguishable from nothing to retry",
  );
});

test("recording the same order twice updates rather than duplicating", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  // Both `queuePrintfulFulfillmentFromOrder` and the Stripe webhook record the
  // same submission, so every printful order used to write two rows: the
  // operator panel double-counted, and the effective capacity was halved.
  const submission = blockedPrintfulSubmission("ord_double");
  recordPrintfulFulfillmentSubmission(submission);
  recordPrintfulFulfillmentSubmission(submission);

  assert.equal(getPrintfulFulfillmentSubmissions().length, 1);
  assert.equal(buildFulfillmentSubmissionSummary().blockedCount, 1);
});

test("a full store refuses the write instead of choosing which paid order to forget", () => {
  const store = createInMemoryFulfillmentSubmissionStore<PrintfulOrderSubmission>("printful", 2);
  store.record(blockedPrintfulSubmission("ord_1"));
  store.record(blockedPrintfulSubmission("ord_2"));

  assert.throws(
    () => store.record(blockedPrintfulSubmission("ord_3")),
    (error: unknown) => {
      assert.ok(error instanceof FulfillmentSubmissionStoreCapacityExceededError);
      assert.equal(error.capacity, 2);
      assert.equal(error.partner, "printful");
      return true;
    },
    "at capacity the store must throw so the webhook can decline to acknowledge the payment",
  );
  assert.equal(store.list().length, 2, "the refused write must not disturb what is stored");
  assert.ok(store.find("ord_1"), "the oldest record must still be there after the refusal");
});

test("the capacity is a memory bound, not a retention window", () => {
  // A number small enough to be reached in normal trading is a retention policy
  // wearing a memory bound's clothes. 50 was; this is the assertion that stops
  // it being quietly lowered back.
  assert.ok(
    IN_MEMORY_FULFILLMENT_STORE_CAPACITY >= 10_000,
    "a capacity an ordinary month of orders can reach is an eviction policy by another name",
  );
});

test("the summary declares that its counts come from a store that forgets", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();
  recordPrintfulFulfillmentSubmission(submittedPrintfulSubmission("ord_only"));

  const summary = buildFulfillmentSubmissionSummary();
  assert.equal(summary.completeness.complete, false);
  assert.equal(summary.completeness.durable, false);
  assert.ok(
    summary.completeness.reason?.includes("lower bound"),
    "a count over a process-local store is a lower bound and must say so",
  );
  assert.ok(
    summary.blockers.includes(summary.completeness.reason ?? ""),
    "the disclosure must reach the operator surface, not just the type",
  );
});

test("both partner stores report themselves as process-local", () => {
  for (const descriptor of [
    getPrintfulFulfillmentStoreDescriptor(),
    getGelatoFulfillmentStoreDescriptor(),
  ]) {
    assert.equal(descriptor.durable, false, "nothing here survives a pod restart yet");
    assert.equal(descriptor.capacity, IN_MEMORY_FULFILLMENT_STORE_CAPACITY);
  }

  assert.equal(
    describeFulfillmentRecordCompleteness([
      { kind: "durable-postgres", durable: true, capacity: 1_000_000 },
      { kind: "durable-postgres", durable: true, capacity: 1_000_000 },
    ]).complete,
    true,
    "the disclosure must clear once a durable store is actually configured",
  );
});
