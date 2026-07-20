import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TEST_API_SECRET = "test-convex-api-secret";

beforeEach(() => {
  process.env.CONVEX_API_SECRET = TEST_API_SECRET;
});

afterEach(() => {
  delete process.env.CONVEX_API_SECRET;
});

interface CommerceOrderRow {
  stripeSessionId: string;
  createdAt: string;
  paidOutAt?: string;
  refundedAt?: string;
  disputedAt?: string;
}

function insertArgs(overrides: {
  orderId?: string;
  leadSlug?: string;
  skuId?: string;
  skuName?: string;
  amountPaidUsd?: number;
  stripeSessionId?: string;
  createdAt?: string;
} = {}) {
  return {
    orderId: overrides.orderId ?? "corder_1",
    leadSlug: overrides.leadSlug ?? "demo-cafe",
    skuId: overrides.skuId ?? "sku_1",
    skuName: overrides.skuName ?? "Latte",
    amountPaidUsd: overrides.amountPaidUsd ?? 4.5,
    stripeSessionId: overrides.stripeSessionId ?? "cs_test_1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  };
}

test("insert is idempotent on stripeSessionId — webhook redelivery never double-counts revenue", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.commerceOrders.insert, insertArgs());
  const second = await t.mutation(api.commerceOrders.insert, insertArgs());
  expect(first).not.toBeNull();
  expect(second).toBeNull();

  const rows = await t.query(api.commerceOrders.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
});

test("insert does not leak apiSecret into the persisted row", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceOrders.insert, insertArgs());
  const row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_test_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(row).not.toBeNull();
  expect(row).not.toHaveProperty("apiSecret");
});

test("markPaidOut / markRefunded / markDisputed / clearDisputed round-trip through listUnpaid / listRefunded / listDisputed", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceOrders.insert, insertArgs({ stripeSessionId: "cs_1" }));

  let unpaid = await t.query(api.commerceOrders.listUnpaid, { apiSecret: TEST_API_SECRET });
  expect(unpaid).toHaveLength(1);

  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_1",
      paidOutAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(true);
  unpaid = await t.query(api.commerceOrders.listUnpaid, { apiSecret: TEST_API_SECRET });
  expect(unpaid).toHaveLength(0);

  // A refund landing AFTER payout is a clawback case — it must stay visible
  // via listRefunded even though listUnpaid has already dropped the row.
  await t.mutation(api.commerceOrders.markRefunded, {
    stripeSessionId: "cs_1",
    refundedAt: "2026-01-03T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const refunded = await t.query(api.commerceOrders.listRefunded, { apiSecret: TEST_API_SECRET });
  expect(refunded).toHaveLength(1);
  expect(refunded[0].paidOutAt).toBe("2026-01-02T00:00:00.000Z");

  // Idempotent: redelivery with a different timestamp must not move the
  // first-recorded refund time.
  await t.mutation(api.commerceOrders.markRefunded, {
    stripeSessionId: "cs_1",
    refundedAt: "2026-01-09T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const refundedAgain = await t.query(api.commerceOrders.listRefunded, { apiSecret: TEST_API_SECRET });
  expect(refundedAgain[0].refundedAt).toBe("2026-01-03T00:00:00.000Z");

  await t.mutation(api.commerceOrders.markDisputed, {
    stripeSessionId: "cs_1",
    disputedAt: "2026-01-04T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  let disputed = await t.query(api.commerceOrders.listDisputed, { apiSecret: TEST_API_SECRET });
  expect(disputed).toHaveLength(1);
  // Disputing must not clear the independent refund flag.
  expect(disputed[0].refundedAt).toBe("2026-01-03T00:00:00.000Z");

  await t.mutation(api.commerceOrders.clearDisputed, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  disputed = await t.query(api.commerceOrders.listDisputed, { apiSecret: TEST_API_SECRET });
  expect(disputed).toHaveLength(0);
  let row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.disputedAt).toBeUndefined();
  // Clearing the dispute must not clear the unrelated refund or paidOutAt marks.
  expect(row?.refundedAt).toBe("2026-01-03T00:00:00.000Z");
  expect(row?.paidOutAt).toBe("2026-01-02T00:00:00.000Z");

  // clearRefunded is the reversal twin of markRefunded (refund.updated
  // failed/canceled) — must clear refundedAt without disturbing paidOutAt.
  await t.mutation(api.commerceOrders.clearRefunded, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  const refundedAfterClear = await t.query(api.commerceOrders.listRefunded, {
    apiSecret: TEST_API_SECRET,
  });
  expect(refundedAfterClear).toHaveLength(0);
  row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.refundedAt).toBeUndefined();
  expect(row?.paidOutAt).toBe("2026-01-02T00:00:00.000Z");

  // Idempotent: clearing an already-clear row is a no-op.
  await expect(
    t.mutation(api.commerceOrders.clearRefunded, {
      stripeSessionId: "cs_1",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("listMissingClientReceipt surfaces orders with no receipt marker, independent of payout/refund/dispute status", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceOrders.insert, insertArgs({ stripeSessionId: "cs_silent" }));
  await t.mutation(api.commerceOrders.insert, insertArgs({ stripeSessionId: "cs_notified" }));

  let missing = await t.query(api.commerceOrders.listMissingClientReceipt, {
    apiSecret: TEST_API_SECRET,
  });
  expect(missing.map((r: CommerceOrderRow) => r.stripeSessionId).sort()).toEqual([
    "cs_notified",
    "cs_silent",
  ]);

  await t.mutation(api.commerceOrders.markClientReceiptSent, {
    stripeSessionId: "cs_notified",
    clientReceiptEmailSentAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  missing = await t.query(api.commerceOrders.listMissingClientReceipt, {
    apiSecret: TEST_API_SECRET,
  });
  expect(missing).toHaveLength(1);
  expect(missing[0].stripeSessionId).toBe("cs_silent");

  // A paid-out order with no receipt marker still counts — payout status and
  // client-notification status are independent axes.
  await t.mutation(api.commerceOrders.markPaidOut, {
    stripeSessionId: "cs_silent",
    paidOutAt: "2026-01-03T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  missing = await t.query(api.commerceOrders.listMissingClientReceipt, {
    apiSecret: TEST_API_SECRET,
  });
  expect(missing).toHaveLength(1);
  expect(missing[0].stripeSessionId).toBe("cs_silent");
});

test("markPaidOut / markRefunded / markDisputed on an unknown stripeSessionId are safe no-ops", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_missing",
      paidOutAt: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
  await expect(
    t.mutation(api.commerceOrders.markRefunded, {
      stripeSessionId: "cs_missing",
      refundedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.commerceOrders.markDisputed, {
      stripeSessionId: "cs_missing",
      disputedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.commerceOrders.clearDisputed, {
      stripeSessionId: "cs_missing",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.commerceOrders.clearRefunded, {
      stripeSessionId: "cs_missing",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  const rows = await t.query(api.commerceOrders.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(0);
});

test("markPaidOut atomically rejects an order that is refunded, disputed, or already paid out — never double-guards on a stale caller read alone", async () => {
  // Regression test for commerce-order-paid-out-refund-race-guard: the
  // dashboard action (markCommerceOrderPaidOutAction) checks
  // refundedAt/disputedAt/paidOutAt on a row it read moments earlier, but an
  // independent Stripe webhook can record a refund/dispute in the window
  // between that read and this mutation. markPaidOut must re-verify all
  // three fields atomically with its own write so a race never leaves a row
  // both paid out AND refunded/disputed.
  const t = convexTest(schema, modules);

  await t.mutation(api.commerceOrders.insert, insertArgs({ stripeSessionId: "cs_refunded" }));
  await t.mutation(api.commerceOrders.markRefunded, {
    stripeSessionId: "cs_refunded",
    refundedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_refunded",
      paidOutAt: "2026-01-03T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
  let row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_refunded",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.paidOutAt).toBeUndefined();

  await t.mutation(
    api.commerceOrders.insert,
    insertArgs({ stripeSessionId: "cs_disputed", orderId: "corder_disputed" }),
  );
  await t.mutation(api.commerceOrders.markDisputed, {
    stripeSessionId: "cs_disputed",
    disputedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_disputed",
      paidOutAt: "2026-01-03T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
  row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_disputed",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.paidOutAt).toBeUndefined();

  await t.mutation(
    api.commerceOrders.insert,
    insertArgs({ stripeSessionId: "cs_already_paid", orderId: "corder_already_paid" }),
  );
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_already_paid",
      paidOutAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(true);
  // Redelivery / a second click after paidOutAt is already set must not
  // move the originally-recorded timestamp.
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_already_paid",
      paidOutAt: "2026-01-09T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
  row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_already_paid",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.paidOutAt).toBe("2026-01-02T00:00:00.000Z");
});

test("markClientReceiptSent atomically re-checks clientReceiptEmailSentAt — never a silent last-writer-wins clobber", async () => {
  // Regression test for commerce-client-receipt-marker-race-guard: both live
  // callers (resendCommerceClientReceiptAction and the Stripe webhook's
  // redelivery-recovery path) read clientReceiptEmailSentAt, send the email,
  // THEN call this mutation — an independent trigger racing that same
  // stale-unset read must not silently overwrite an already-recorded
  // timestamp, and the mutation must tell the loser of the race it lost.
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceOrders.insert, insertArgs({ stripeSessionId: "cs_receipt_race" }));

  await expect(
    t.mutation(api.commerceOrders.markClientReceiptSent, {
      stripeSessionId: "cs_receipt_race",
      clientReceiptEmailSentAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(true);

  // A second, racing call (e.g. a webhook redelivery landing right after a
  // manual resend, or vice versa) must lose the race and leave the
  // originally-recorded timestamp untouched.
  await expect(
    t.mutation(api.commerceOrders.markClientReceiptSent, {
      stripeSessionId: "cs_receipt_race",
      clientReceiptEmailSentAt: "2026-01-09T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);

  const row = await t.query(api.commerceOrders.getByStripeSessionId, {
    stripeSessionId: "cs_receipt_race",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.clientReceiptEmailSentAt).toBe("2026-01-02T00:00:00.000Z");
});

test("markClientReceiptSent on an unknown stripeSessionId is a safe no-op returning false", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.commerceOrders.markClientReceiptSent, {
      stripeSessionId: "cs_missing",
      clientReceiptEmailSentAt: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
});

test("list / listUnpaid / listRefunded / listDisputed sort newest createdAt first", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.commerceOrders.insert,
    insertArgs({ stripeSessionId: "cs_a", orderId: "corder_a", createdAt: "2026-01-01T00:00:00.000Z" }),
  );
  await t.mutation(
    api.commerceOrders.insert,
    insertArgs({ stripeSessionId: "cs_b", orderId: "corder_b", createdAt: "2026-01-03T00:00:00.000Z" }),
  );
  await t.mutation(
    api.commerceOrders.insert,
    insertArgs({ stripeSessionId: "cs_c", orderId: "corder_c", createdAt: "2026-01-02T00:00:00.000Z" }),
  );

  const rows: CommerceOrderRow[] = await t.query(api.commerceOrders.list, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r) => r.stripeSessionId)).toEqual(["cs_b", "cs_c", "cs_a"]);
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.commerceOrders.insert, { ...insertArgs(), apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.commerceOrders.list, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.commerceOrders.listUnpaid, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.commerceOrders.listRefunded, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.commerceOrders.listDisputed, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.commerceOrders.listMissingClientReceipt, { apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.commerceOrders.getByStripeSessionId, { stripeSessionId: "cs_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, {
      stripeSessionId: "cs_1",
      paidOutAt: "2026-01-01T00:00:00.000Z",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.markClientReceiptSent, {
      stripeSessionId: "cs_1",
      clientReceiptEmailSentAt: "2026-01-01T00:00:00.000Z",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.markRefunded, {
      stripeSessionId: "cs_1",
      refundedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.markDisputed, {
      stripeSessionId: "cs_1",
      disputedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.clearDisputed, { stripeSessionId: "cs_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.clearRefunded, { stripeSessionId: "cs_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});

test("every function rejects any caller (even a correct-looking guess) when CONVEX_API_SECRET is unset", async () => {
  delete process.env.CONVEX_API_SECRET;
  const t = convexTest(schema, modules);
  await expect(t.query(api.commerceOrders.list, { apiSecret: "" })).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.commerceOrders.insert, { ...insertArgs(), apiSecret: TEST_API_SECRET }),
  ).rejects.toThrow(/Unauthorized/);
});
