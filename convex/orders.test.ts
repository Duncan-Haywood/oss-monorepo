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
