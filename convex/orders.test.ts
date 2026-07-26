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

interface OrderRow {
  stripeSessionId: string;
  createdAt: number;
  tier: string;
  commerceAddon: boolean;
  recurringCanceledAt?: number;
  refundedAt?: string;
  disputedAt?: string;
}

function newOrderArgs(overrides: {
  leadSlug?: string;
  tier?: "starter" | "growth" | "complete";
  commerceAddon?: boolean;
  stripeSessionId?: string;
  stripeCustomerId?: string;
  amountTotal?: number;
  customerEmail?: string;
} = {}) {
  return {
    leadSlug: overrides.leadSlug ?? "demo-cafe",
    tier: overrides.tier ?? "growth",
    commerceAddon: overrides.commerceAddon ?? false,
    stripeSessionId: overrides.stripeSessionId ?? "cs_test_1",
    stripeCustomerId: overrides.stripeCustomerId ?? "cus_test_1",
    amountTotal: overrides.amountTotal ?? 9900,
    customerEmail: overrides.customerEmail ?? "owner@demo-cafe.example",
    apiSecret: TEST_API_SECRET,
  };
}

test("createOrder is idempotent on stripeSessionId — webhook redelivery never double-inserts", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.orders.createOrder, newOrderArgs());
  const second = await t.mutation(api.orders.createOrder, newOrderArgs());
  expect(second).toBe(first);

  const rows = await t.query(api.orders.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
});

test("markRecurringCanceledByCustomer only patches recurring-entitlement rows, and is idempotent", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth" }));
  await t.mutation(
    api.orders.createOrder,
    newOrderArgs({ tier: "starter", commerceAddon: false, stripeSessionId: "cs_starter" }),
  );

  const first = await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 1_000,
    apiSecret: TEST_API_SECRET,
  });
  // Only the growth row has recurring entitlement — the plain starter row is skipped.
  expect(first.updatedCount).toBe(1);

  const rows: OrderRow[] = await t.query(api.orders.getByStripeCustomerId, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });
  const growthRow = rows.find((r) => r.stripeSessionId === "cs_growth");
  const starterRow = rows.find((r) => r.stripeSessionId === "cs_starter");
  expect(growthRow?.recurringCanceledAt).toBe(1_000);
  expect(starterRow?.recurringCanceledAt).toBeUndefined();

  // Redelivery with a different timestamp must not move the already-canceled mark.
  const second = await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 2_000,
    apiSecret: TEST_API_SECRET,
  });
  expect(second.updatedCount).toBe(0);
  const rowsAfter: OrderRow[] = await t.query(api.orders.getByStripeCustomerId, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(rowsAfter.find((r) => r.stripeSessionId === "cs_growth")?.recurringCanceledAt).toBe(1_000);
});

test("clearRecurringCanceledByCustomer clears the pause and carries refundedAt/disputedAt forward untouched", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth" }));
  await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 1_000,
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.markDisputed, {
    stripeSessionId: "cs_growth",
    disputedAt: "2026-01-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  const cleared = await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(cleared.updatedCount).toBe(1);

  const row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.recurringCanceledAt).toBeUndefined();
  // disputedAt must survive the replace() — the pause-clear must not silently
  // reinstate a disputed order's clean state.
  expect(row?.disputedAt).toBe("2026-01-01T00:00:00.000Z");

  // Idempotent: nothing left to clear.
  const again = await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(again.updatedCount).toBe(0);
});

test("syncRecurringEntitlementByCustomer refuses a non-recurring target and only patches rows that actually changed", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth" }));

  // A starter+false target has no recurring entitlement — must be a no-op,
  // never silently downgrade a lead's CRM tier to "no monthly unlock."
  const refused = await t.mutation(api.orders.syncRecurringEntitlementByCustomer, {
    stripeCustomerId: "cus_test_1",
    tier: "starter",
    commerceAddon: false,
    apiSecret: TEST_API_SECRET,
  });
  expect(refused.updatedCount).toBe(0);
  const unchanged = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(unchanged?.tier).toBe("growth");

  const synced = await t.mutation(api.orders.syncRecurringEntitlementByCustomer, {
    stripeCustomerId: "cus_test_1",
    tier: "complete",
    commerceAddon: true,
    apiSecret: TEST_API_SECRET,
  });
  expect(synced.updatedCount).toBe(1);

  // Idempotent once already matching the target.
  const again = await t.mutation(api.orders.syncRecurringEntitlementByCustomer, {
    stripeCustomerId: "cus_test_1",
    tier: "complete",
    commerceAddon: true,
    apiSecret: TEST_API_SECRET,
  });
  expect(again.updatedCount).toBe(0);
});

test("recordSubscriptionRenewalPayment accrues lifetimeRevenueUsd and is idempotent on invoiceId", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.orders.createOrder,
    newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth", amountTotal: 4900 }),
  );

  const first = await t.mutation(api.orders.recordSubscriptionRenewalPayment, {
    stripeCustomerId: "cus_test_1",
    invoiceId: "in_cycle_1",
    amountUsd: 49,
    apiSecret: TEST_API_SECRET,
  });
  expect(first.recorded).toBe(true);

  const row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  // amountTotal (4900 cents) round-trips through db.ts as USD dollars
  // elsewhere; this mutation operates purely on the USD figures it's given.
  expect(row?.lifetimeRevenueUsd).toBe(4949);
  expect(row?.lastRenewalInvoiceId).toBe("in_cycle_1");

  // Stripe redelivers invoice.paid — the same invoiceId must never double-count.
  const redelivered = await t.mutation(api.orders.recordSubscriptionRenewalPayment, {
    stripeCustomerId: "cus_test_1",
    invoiceId: "in_cycle_1",
    amountUsd: 49,
    apiSecret: TEST_API_SECRET,
  });
  expect(redelivered.recorded).toBe(false);
  const unchanged = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(unchanged?.lifetimeRevenueUsd).toBe(4949);

  // A second, distinct renewal invoice accrues on top.
  const second = await t.mutation(api.orders.recordSubscriptionRenewalPayment, {
    stripeCustomerId: "cus_test_1",
    invoiceId: "in_cycle_2",
    amountUsd: 49,
    apiSecret: TEST_API_SECRET,
  });
  expect(second.recorded).toBe(true);
  const rowAfterSecond = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(rowAfterSecond?.lifetimeRevenueUsd).toBe(4998);
  expect(rowAfterSecond?.lastRenewalInvoiceId).toBe("in_cycle_2");
});

test("recordSubscriptionRenewalPayment skips a canceled/refunded/disputed order (no entitled row)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.orders.createOrder,
    newOrderArgs({ tier: "growth", stripeSessionId: "cs_canceled" }),
  );
  await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 1_000,
    apiSecret: TEST_API_SECRET,
  });

  const result = await t.mutation(api.orders.recordSubscriptionRenewalPayment, {
    stripeCustomerId: "cus_test_1",
    invoiceId: "in_cycle_1",
    amountUsd: 49,
    apiSecret: TEST_API_SECRET,
  });
  expect(result.recorded).toBe(false);

  const row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_canceled",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lifetimeRevenueUsd).toBeUndefined();
});

test("clearRecurringCanceledByCustomer preserves lifetimeRevenueUsd/lastRenewalInvoiceId across its replace()", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.orders.createOrder,
    newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth" }),
  );
  await t.mutation(api.orders.recordSubscriptionRenewalPayment, {
    stripeCustomerId: "cus_test_1",
    invoiceId: "in_cycle_1",
    amountUsd: 49,
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 1_000,
    apiSecret: TEST_API_SECRET,
  });

  // clearRecurringCanceledByCustomer replaces the whole document (see
  // convex-patch-undefined-clear-semantics-correction) — a resubscribe must
  // not silently wipe revenue already recorded for this customer.
  await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });

  const row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.recurringCanceledAt).toBeUndefined();
  // newOrderArgs' default amountTotal (9900 cents = $99) is the base the
  // renewal accrues onto.
  expect(row?.lifetimeRevenueUsd).toBe(9949);
  expect(row?.lastRenewalInvoiceId).toBe("in_cycle_1");
});

test("clearRecurringCanceledByCustomer / clearRefunded / clearDisputed preserve lastBillingNoticeSendFailedAt/Type across their replace()", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.orders.createOrder,
    newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth" }),
  );
  await t.mutation(api.orders.recordBillingNoticeSendOutcome, {
    stripeSessionId: "cs_growth",
    noticeType: "payment_failed",
    success: false,
    atMs: 1_700_000_000_000,
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 1_000,
    apiSecret: TEST_API_SECRET,
  });

  // Each of these three mutations replaces the whole document (see
  // convex-patch-undefined-clear-semantics-correction) — none of them is
  // about billing-notice sends, so none should silently wipe an unrelated
  // send-failure marker (see billing-notice-send-failure-visibility).
  await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });
  let row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastBillingNoticeSendFailedAt).toBe(1_700_000_000_000);
  expect(row?.lastBillingNoticeSendFailedType).toBe("payment_failed");

  await t.mutation(api.orders.markRefunded, {
    stripeSessionId: "cs_growth",
    refundedAt: "2026-02-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.clearRefunded, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastBillingNoticeSendFailedAt).toBe(1_700_000_000_000);
  expect(row?.lastBillingNoticeSendFailedType).toBe("payment_failed");

  await t.mutation(api.orders.markDisputed, {
    stripeSessionId: "cs_growth",
    disputedAt: "2026-03-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.clearDisputed, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastBillingNoticeSendFailedAt).toBe(1_700_000_000_000);
  expect(row?.lastBillingNoticeSendFailedType).toBe("payment_failed");
});

test("clearRecurringCanceledByCustomer / clearRefunded / clearDisputed preserve acquisitionSource across their replace()", async () => {
  const t = convexTest(schema, modules);
  // createOrder (this file's test-seeding helper) has no acquisitionSource
  // param — markLeadPaid is the real production write path that sets it, so
  // seed through that instead.
  await t.mutation(api.leads.markLeadPaid, {
    slug: "acquisition-source-lead",
    stripeSessionId: "cs_source_growth",
    customerEmail: "buyer@example.com",
    tier: "growth",
    commerceAddon: false,
    amountTotal: 9900,
    stripeCustomerId: "cus_source_test",
    acquisitionSource: "cat-salon",
    apiSecret: TEST_API_SECRET,
  });

  await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_source_test",
    canceledAt: 1_000,
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_source_test",
    apiSecret: TEST_API_SECRET,
  });
  let row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_source_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.acquisitionSource).toBe("cat-salon");

  await t.mutation(api.orders.markRefunded, {
    stripeSessionId: "cs_source_growth",
    refundedAt: "2026-02-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.clearRefunded, {
    stripeSessionId: "cs_source_growth",
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_source_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.acquisitionSource).toBe("cat-salon");

  await t.mutation(api.orders.markDisputed, {
    stripeSessionId: "cs_source_growth",
    disputedAt: "2026-03-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.orders.clearDisputed, {
    stripeSessionId: "cs_source_growth",
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_source_growth",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.acquisitionSource).toBe("cat-salon");
});

test("recordBillingNoticeSendOutcome records a failure, clears it on success, and no-ops for an unknown session", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_1" }));

  await t.mutation(api.orders.recordBillingNoticeSendOutcome, {
    stripeSessionId: "cs_1",
    noticeType: "subscription_paused",
    success: false,
    atMs: 1_700_000_000_000,
    apiSecret: TEST_API_SECRET,
  });
  let row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastBillingNoticeSendFailedAt).toBe(1_700_000_000_000);
  expect(row?.lastBillingNoticeSendFailedType).toBe("subscription_paused");

  // A later failure of a different notice type overwrites which type/when —
  // this is a single "is billing communication reaching this customer"
  // signal, not a per-notice-type ledger.
  await t.mutation(api.orders.recordBillingNoticeSendOutcome, {
    stripeSessionId: "cs_1",
    noticeType: "payment_failed",
    success: false,
    atMs: 1_700_000_100_000,
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastBillingNoticeSendFailedAt).toBe(1_700_000_100_000);
  expect(row?.lastBillingNoticeSendFailedType).toBe("payment_failed");

  // A success clears the marker via patch(undefined) — see
  // convex-patch-undefined-clear-semantics-correction.
  await t.mutation(api.orders.recordBillingNoticeSendOutcome, {
    stripeSessionId: "cs_1",
    noticeType: "subscription_resumed",
    success: true,
    atMs: 1_700_000_200_000,
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastBillingNoticeSendFailedAt).toBeUndefined();
  expect(row?.lastBillingNoticeSendFailedType).toBeUndefined();

  // Idempotent no-op when there's nothing to clear.
  await expect(
    t.mutation(api.orders.recordBillingNoticeSendOutcome, {
      stripeSessionId: "cs_1",
      noticeType: "subscription_resumed",
      success: true,
      atMs: 1_700_000_300_000,
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  // Unknown session id: no matching row, no throw.
  await expect(
    t.mutation(api.orders.recordBillingNoticeSendOutcome, {
      stripeSessionId: "cs_does_not_exist",
      noticeType: "payment_failed",
      success: false,
      atMs: 1_700_000_400_000,
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("markRefunded / markDisputed / clearDisputed are idempotent and independent of each other", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_1" }));

  await t.mutation(api.orders.markRefunded, {
    stripeSessionId: "cs_1",
    refundedAt: "2026-02-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  // Redelivery with a different timestamp must not move the first-recorded refund time.
  await t.mutation(api.orders.markRefunded, {
    stripeSessionId: "cs_1",
    refundedAt: "2026-02-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const afterRefund = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(afterRefund?.refundedAt).toBe("2026-02-01T00:00:00.000Z");

  await t.mutation(api.orders.markDisputed, {
    stripeSessionId: "cs_1",
    disputedAt: "2026-03-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const afterDispute = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  // Disputing must not clear the independent refund flag.
  expect(afterDispute?.refundedAt).toBe("2026-02-01T00:00:00.000Z");
  expect(afterDispute?.disputedAt).toBe("2026-03-01T00:00:00.000Z");

  await t.mutation(api.orders.clearDisputed, { stripeSessionId: "cs_1", apiSecret: TEST_API_SECRET });
  const afterClear = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(afterClear?.disputedAt).toBeUndefined();
  // Clearing a dispute (funds reinstated) must not clear an unrelated refund.
  expect(afterClear?.refundedAt).toBe("2026-02-01T00:00:00.000Z");

  // Idempotent: clearing again on an already-clear row is a no-op, not an error.
  await expect(
    t.mutation(api.orders.clearDisputed, { stripeSessionId: "cs_1", apiSecret: TEST_API_SECRET }),
  ).resolves.toBeNull();

  // clearRefunded is the reversal twin of markRefunded (refund.updated
  // failed/canceled) — must clear refundedAt without disturbing disputedAt.
  await t.mutation(api.orders.clearRefunded, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  const afterRefundClear = await t.query(api.orders.getByStripeSessionId, {
    stripeSessionId: "cs_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(afterRefundClear?.refundedAt).toBeUndefined();

  // Idempotent: clearing an already-clear row is a no-op, not an error.
  await expect(
    t.mutation(api.orders.clearRefunded, { stripeSessionId: "cs_1", apiSecret: TEST_API_SECRET }),
  ).resolves.toBeNull();
});

test("list / listByLeadSlug / getByStripeCustomerId are all newest-createdAt-first", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_a", leadSlug: "demo-cafe" }));
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_b", leadSlug: "demo-cafe" }));
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_c", leadSlug: "demo-cafe" }));

  const all: OrderRow[] = await t.query(api.orders.list, { apiSecret: TEST_API_SECRET });
  const bySlug: OrderRow[] = await t.query(api.orders.listByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  const byCustomer: OrderRow[] = await t.query(api.orders.getByStripeCustomerId, {
    stripeCustomerId: "cus_test_1",
    apiSecret: TEST_API_SECRET,
  });

  for (const rows of [all, bySlug, byCustomer]) {
    const createdAts = rows.map((r) => r.createdAt);
    const sorted = [...createdAts].sort((a, b) => b - a);
    expect(createdAts).toEqual(sorted);
  }
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.orders.createOrder, { ...newOrderArgs(), apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.orders.list, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.orders.listByLeadSlug, { leadSlug: "demo-cafe", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.orders.getByStripeSessionId, { stripeSessionId: "cs_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.orders.getByStripeCustomerId, { stripeCustomerId: "cus_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.markRecurringCanceledByCustomer, {
      stripeCustomerId: "cus_1",
      canceledAt: 1000,
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.clearRecurringCanceledByCustomer, {
      stripeCustomerId: "cus_1",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.syncRecurringEntitlementByCustomer, {
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: false,
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.markRefunded, {
      stripeSessionId: "cs_1",
      refundedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.markDisputed, {
      stripeSessionId: "cs_1",
      disputedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.clearDisputed, { stripeSessionId: "cs_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.clearRefunded, { stripeSessionId: "cs_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});

test("every function rejects any caller (even a correct-looking guess) when CONVEX_API_SECRET is unset", async () => {
  delete process.env.CONVEX_API_SECRET;
  const t = convexTest(schema, modules);
  await expect(t.query(api.orders.list, { apiSecret: "" })).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.orders.createOrder, { ...newOrderArgs(), apiSecret: "" }),
  ).rejects.toThrow(/Unauthorized/);
});
