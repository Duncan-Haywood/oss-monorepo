import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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
  };
}

test("createOrder is idempotent on stripeSessionId — webhook redelivery never double-inserts", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.orders.createOrder, newOrderArgs());
  const second = await t.mutation(api.orders.createOrder, newOrderArgs());
  expect(second).toBe(first);

  const rows = await t.query(api.orders.list, {});
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
  });
  // Only the growth row has recurring entitlement — the plain starter row is skipped.
  expect(first.updatedCount).toBe(1);

  const rows: OrderRow[] = await t.query(api.orders.getByStripeCustomerId, { stripeCustomerId: "cus_test_1" });
  const growthRow = rows.find((r) => r.stripeSessionId === "cs_growth");
  const starterRow = rows.find((r) => r.stripeSessionId === "cs_starter");
  expect(growthRow?.recurringCanceledAt).toBe(1_000);
  expect(starterRow?.recurringCanceledAt).toBeUndefined();

  // Redelivery with a different timestamp must not move the already-canceled mark.
  const second = await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 2_000,
  });
  expect(second.updatedCount).toBe(0);
  const rowsAfter: OrderRow[] = await t.query(api.orders.getByStripeCustomerId, { stripeCustomerId: "cus_test_1" });
  expect(rowsAfter.find((r) => r.stripeSessionId === "cs_growth")?.recurringCanceledAt).toBe(1_000);
});

test("clearRecurringCanceledByCustomer clears the pause and carries refundedAt/disputedAt forward untouched", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ tier: "growth", stripeSessionId: "cs_growth" }));
  await t.mutation(api.orders.markRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
    canceledAt: 1_000,
  });
  await t.mutation(api.orders.markDisputed, { stripeSessionId: "cs_growth", disputedAt: "2026-01-01T00:00:00.000Z" });

  const cleared = await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
  });
  expect(cleared.updatedCount).toBe(1);

  const row = await t.query(api.orders.getByStripeSessionId, { stripeSessionId: "cs_growth" });
  expect(row?.recurringCanceledAt).toBeUndefined();
  // disputedAt must survive the replace() — the pause-clear must not silently
  // reinstate a disputed order's clean state.
  expect(row?.disputedAt).toBe("2026-01-01T00:00:00.000Z");

  // Idempotent: nothing left to clear.
  const again = await t.mutation(api.orders.clearRecurringCanceledByCustomer, {
    stripeCustomerId: "cus_test_1",
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
  });
  expect(refused.updatedCount).toBe(0);
  const unchanged = await t.query(api.orders.getByStripeSessionId, { stripeSessionId: "cs_growth" });
  expect(unchanged?.tier).toBe("growth");

  const synced = await t.mutation(api.orders.syncRecurringEntitlementByCustomer, {
    stripeCustomerId: "cus_test_1",
    tier: "complete",
    commerceAddon: true,
  });
  expect(synced.updatedCount).toBe(1);

  // Idempotent once already matching the target.
  const again = await t.mutation(api.orders.syncRecurringEntitlementByCustomer, {
    stripeCustomerId: "cus_test_1",
    tier: "complete",
    commerceAddon: true,
  });
  expect(again.updatedCount).toBe(0);
});

test("markRefunded / markDisputed / clearDisputed are idempotent and independent of each other", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_1" }));

  await t.mutation(api.orders.markRefunded, { stripeSessionId: "cs_1", refundedAt: "2026-02-01T00:00:00.000Z" });
  // Redelivery with a different timestamp must not move the first-recorded refund time.
  await t.mutation(api.orders.markRefunded, { stripeSessionId: "cs_1", refundedAt: "2026-02-02T00:00:00.000Z" });
  const afterRefund = await t.query(api.orders.getByStripeSessionId, { stripeSessionId: "cs_1" });
  expect(afterRefund?.refundedAt).toBe("2026-02-01T00:00:00.000Z");

  await t.mutation(api.orders.markDisputed, { stripeSessionId: "cs_1", disputedAt: "2026-03-01T00:00:00.000Z" });
  const afterDispute = await t.query(api.orders.getByStripeSessionId, { stripeSessionId: "cs_1" });
  // Disputing must not clear the independent refund flag.
  expect(afterDispute?.refundedAt).toBe("2026-02-01T00:00:00.000Z");
  expect(afterDispute?.disputedAt).toBe("2026-03-01T00:00:00.000Z");

  await t.mutation(api.orders.clearDisputed, { stripeSessionId: "cs_1" });
  const afterClear = await t.query(api.orders.getByStripeSessionId, { stripeSessionId: "cs_1" });
  expect(afterClear?.disputedAt).toBeUndefined();
  // Clearing a dispute (funds reinstated) must not clear an unrelated refund.
  expect(afterClear?.refundedAt).toBe("2026-02-01T00:00:00.000Z");

  // Idempotent: clearing again on an already-clear row is a no-op, not an error.
  await expect(t.mutation(api.orders.clearDisputed, { stripeSessionId: "cs_1" })).resolves.toBeNull();
});

test("list / listByLeadSlug / getByStripeCustomerId are all newest-createdAt-first", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_a", leadSlug: "demo-cafe" }));
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_b", leadSlug: "demo-cafe" }));
  await t.mutation(api.orders.createOrder, newOrderArgs({ stripeSessionId: "cs_c", leadSlug: "demo-cafe" }));

  const all: OrderRow[] = await t.query(api.orders.list, {});
  const bySlug: OrderRow[] = await t.query(api.orders.listByLeadSlug, { leadSlug: "demo-cafe" });
  const byCustomer: OrderRow[] = await t.query(api.orders.getByStripeCustomerId, { stripeCustomerId: "cus_test_1" });

  for (const rows of [all, bySlug, byCustomer]) {
    const createdAts = rows.map((r) => r.createdAt);
    const sorted = [...createdAts].sort((a, b) => b - a);
    expect(createdAts).toEqual(sorted);
  }
});
