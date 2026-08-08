import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  IN_MEMORY_ORDER_STORE_KIND,
  OrderStoreCapacityExceededError,
  buildOrderSummary,
  clearOrdersForTests,
  createInMemoryOrderStore,
  describeOrderRecordCompleteness,
  getOrderRecords,
  getOrderStoreDescriptor,
  recordOrderFromPaymentWebhook,
  resetOrderStoreForTests,
  setOrderStore,
  type OrderRecord,
  type OrderStore,
} from "../src/lib/orders.ts";
import { buildPayoutReconciliationWithDiagnostics } from "../src/lib/payout-reconciliation.ts";
import { checkConvexDatabaseSyncStatus } from "../src/lib/convex-sync-status.ts";
import { POST } from "../src/app/api/stripe/webhook/route";

/**
 * The only store of a paid order was `const orderStore: OrderRecord[] = []` with
 *
 *     orderStore.unshift(order);
 *     if (orderStore.length > 100) { orderStore.length = 100; }
 *
 * — a silently truncating ring buffer. Order 101 destroyed order 1 with no log,
 * no error and no signal, during normal operation. Everything downstream reduced
 * over the survivors and reported confident totals: `buildOrderSummary` under-
 * stated revenue and artist transfers, and `payout-reconciliation` built each
 * artist's owed amount from the same shrunken set, so an artist's money fell off
 * the ledger entirely rather than being flagged as missing.
 *
 * These tests are deliberately written against the pre-existing public API
 * (`recordOrderFromPaymentWebhook`, `getOrderRecords`, `buildOrderSummary`)
 * wherever possible, so they fail on the old *behaviour* rather than merely on a
 * missing export. Nothing here mocks `orders.ts` — the module the fix lives in.
 */

/** Drives a real paid-order webhook record, one per unique Stripe event id. */
function recordPaidOrder(n: number): OrderRecord | null {
  return recordOrderFromPaymentWebhook(
    `evt_cap_${n}`,
    "payment_intent.succeeded",
    {
      id: `pi_cap_${n}`,
      amount: 1000,
      currency: "usd",
      metadata: {
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: "3.00",
        artistAccountId: `acct_artist_${n}`,
        artistHandle: `artist_${n}`,
        lineItemCount: "1",
      },
    },
    true,
  );
}

/**
 * The webhook asks Stripe for the buyer's email when the event does not carry
 * one, and these events do not. That call is gated on `STRIPE_SECRET_KEY`, so a
 * developer with one exported would have these tests reaching the real Stripe
 * API and asserting on what it said. What is under test here is the order store,
 * not the network: unset it, and restore whatever was there.
 */
const savedSecretKey: { value?: string } = {};

beforeEach(() => {
  savedSecretKey.value = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  resetOrderStoreForTests();
  clearOrdersForTests();
});

afterEach(() => {
  if (savedSecretKey.value === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = savedSecretKey.value;
  }
  resetOrderStoreForTests();
});

test("a paid order is never silently evicted to make room for a newer one", () => {
  for (let n = 1; n <= 101; n += 1) {
    recordPaidOrder(n);
  }

  const records = getOrderRecords();

  // Old behaviour: 100. The 101st write deleted the 1st paid order.
  assert.equal(
    records.length,
    101,
    "every recorded paid order must still be retrievable; the store must not drop the oldest",
  );
  assert.ok(
    records.some((order) => order.stripeEventId === "evt_cap_1"),
    "the first paid order must survive the 101st — it was evicted with no signal",
  );
});

test("order summary does not under-report revenue or artist transfers past the old cap", () => {
  for (let n = 1; n <= 101; n += 1) {
    recordPaidOrder(n);
  }

  const summary = buildOrderSummary();

  // Old behaviour: 100_000 cents and 300 in transfers — plausible, and wrong in
  // the direction that flatters us.
  assert.equal(summary.totalOrders, 101);
  assert.equal(summary.totalRevenueCents, 101_000);
  assert.equal(
    Math.round(summary.totalArtistTransfers * 100),
    101 * 300,
    "artist transfer total must cover every paid order, not just the surviving window",
  );
});

test("payout reconciliation still sees the oldest artist's order past the old cap", () => {
  for (let n = 1; n <= 101; n += 1) {
    recordPaidOrder(n);
  }

  const diagnostics = buildPayoutReconciliationWithDiagnostics();

  // Old behaviour: 100 considered / 100 attributed. artist_1's expectation simply
  // did not exist, so no row and no variance was ever reported for them: silent
  // underpayment, beginning exactly when the business starts working.
  assert.equal(diagnostics.attributionGap.ordersConsidered, 101);
  assert.equal(diagnostics.attributionGap.ordersAttributed, 101);
  assert.ok(
    diagnostics.report.rows.some((row) => row.artistAccountId === "acct_artist_1"),
    "the oldest artist must still appear in the reconciliation",
  );
});

test("a full order store refuses the write rather than deciding which paid order stops existing", () => {
  setOrderStore(createInMemoryOrderStore(2));

  assert.ok(recordPaidOrder(1));
  assert.ok(recordPaidOrder(2));

  assert.throws(
    () => recordPaidOrder(3),
    (error: unknown) => {
      assert.ok(
        error instanceof OrderStoreCapacityExceededError,
        "a full store must raise, not evict",
      );
      assert.equal(error.capacity, 2);
      return true;
    },
  );

  const records = getOrderRecords();
  assert.equal(records.length, 2, "the refused write must not have displaced a stored order");
  assert.ok(records.some((order) => order.stripeEventId === "evt_cap_1"));
});

test("a summary over the process-local store declares itself incomplete", () => {
  recordPaidOrder(1);

  const descriptor = getOrderStoreDescriptor();
  assert.equal(descriptor.kind, IN_MEMORY_ORDER_STORE_KIND);
  assert.equal(descriptor.durable, false, "the default store does not survive a restart");

  const summary = buildOrderSummary();
  assert.equal(
    summary.completeness.complete,
    false,
    "a process-local count must not be presented as the complete set of orders",
  );
  assert.equal(summary.completeness.durable, false);
  assert.match(String(summary.completeness.reason), /process-local/i);
});

test("completeness tracks the configured store rather than being pinned false", () => {
  // Guards the mirror-image defect: a flag hardcoded to the pessimistic value is
  // just as uninformative as one hardcoded to the optimistic value.
  const durableRecords: OrderRecord[] = [];
  const durableStore: OrderStore = {
    descriptor: { kind: "test-durable-store", durable: true, capacity: 1000 },
    findByStripeEventId: (id) => durableRecords.find((o) => o.stripeEventId === id),
    append: (order) => {
      durableRecords.unshift(order);
    },
    list: () => [...durableRecords],
    clear: () => {
      durableRecords.length = 0;
    },
  };

  setOrderStore(durableStore);
  recordPaidOrder(1);

  const summary = buildOrderSummary();
  assert.equal(summary.completeness.complete, true);
  assert.equal(summary.completeness.storeKind, "test-durable-store");
  assert.equal(summary.completeness.reason, null);
  assert.equal(describeOrderRecordCompleteness().durable, true);
});

test("reconciliation reports a non-durable order source as a blocker", () => {
  recordPaidOrder(1);

  const diagnostics = buildPayoutReconciliationWithDiagnostics();

  assert.equal(diagnostics.sourceCompleteness.complete, false);
  assert.ok(
    diagnostics.attributionGap.blocker,
    "a reconciliation drawn from a store that loses rows must not report a null blocker",
  );
  assert.match(String(diagnostics.attributionGap.blocker), /process-local/i);
});

test("convex sync status does not report an unconfigured local array as a synced table", () => {
  const savedPublic = process.env.NEXT_PUBLIC_CONVEX_URL;
  const savedUrl = process.env.CONVEX_URL;
  delete process.env.NEXT_PUBLIC_CONVEX_URL;
  delete process.env.CONVEX_URL;

  try {
    const status = checkConvexDatabaseSyncStatus();

    // Old behaviour: `isConvexConfigured ? "synced" : "synced"` and
    // `isConvexConfigured ? "healthy" : "healthy"`. This venture has no `convex`
    // dependency, no `convex/` directory and no Convex client, so every table was
    // reporting an in-process array as a synced database table.
    assert.equal(status.overallStatus, "unconfigured");
    assert.equal(status.deploymentEnv, "local-memory-store");
    const orders = status.tables.find((t) => t.tableName === "orders");
    assert.ok(orders);
    assert.equal(orders?.status, "unconfigured");
    assert.ok(
      status.tables.every((t) => t.status === "unconfigured"),
      "no table backed by a process-local array may report itself synced",
    );
  } finally {
    if (savedPublic === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = savedPublic;
    if (savedUrl === undefined) delete process.env.CONVEX_URL;
    else process.env.CONVEX_URL = savedUrl;
  }
});

/* ---------------------------------------------------------------------------
 * The webhook must not acknowledge a payment whose order it failed to store.
 * A 200 here tells Stripe to stop redelivering.
 * ------------------------------------------------------------------------- */

const WEBHOOK_SECRET = "whsec_durability_secret";

function sign(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

test("webhook refuses to acknowledge an order the store could not accept", async () => {
  const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  // A store with no room at all: every append is refused.
  setOrderStore(createInMemoryOrderStore(0));

  try {
    const body = JSON.stringify({
      id: "evt_webhook_full",
      type: "payment_intent.succeeded",
      livemode: false,
      data: {
        object: {
          id: "pi_webhook_full",
          amount: 4200,
          currency: "usd",
          metadata: { fulfillmentPartnerId: "printful", lineItemCount: "1" },
        },
      },
    });

    const response = await POST(
      new Request("https://print-atelier.test/api/stripe/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": sign(body) },
        body,
      }),
    );

    assert.equal(
      response.status,
      503,
      "a 2xx would tell Stripe the order is safely written down and stop redelivery",
    );
    const json = (await response.json()) as Record<string, unknown>;
    assert.equal(json.orderRecorded, false);
    assert.equal(json.received, undefined, "the handler must not claim receipt");
    assert.equal(getOrderRecords().length, 0);
  } finally {
    if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  }
});

test("webhook discloses that a recorded order is not durably stored", async () => {
  const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  try {
    const body = JSON.stringify({
      id: "evt_webhook_ok",
      type: "payment_intent.succeeded",
      livemode: false,
      data: {
        object: {
          id: "pi_webhook_ok",
          amount: 4200,
          currency: "usd",
          metadata: { fulfillmentPartnerId: "printful", lineItemCount: "1" },
        },
      },
    });

    const response = await POST(
      new Request("https://print-atelier.test/api/stripe/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": sign(body) },
        body,
      }),
    );

    assert.equal(response.status, 200);
    const json = (await response.json()) as Record<string, unknown>;
    assert.equal(json.orderRecorded, true);
    assert.equal(
      json.orderDurable,
      false,
      "`orderRecorded: true` alone implies a durability this store does not provide",
    );
    assert.equal(json.orderStoreKind, IN_MEMORY_ORDER_STORE_KIND);
  } finally {
    if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  }
});
