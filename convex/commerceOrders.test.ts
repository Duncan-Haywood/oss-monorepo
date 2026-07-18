import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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
  };
}

test("insert is idempotent on stripeSessionId — webhook redelivery never double-counts revenue", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.commerceOrders.insert, insertArgs());
  const second = await t.mutation(api.commerceOrders.insert, insertArgs());
  expect(first).not.toBeNull();
  expect(second).toBeNull();

  const rows = await t.query(api.commerceOrders.list, {});
  expect(rows).toHaveLength(1);
});

test("markPaidOut / markRefunded / markDisputed / clearDisputed round-trip through listUnpaid / listRefunded / listDisputed", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceOrders.insert, insertArgs({ stripeSessionId: "cs_1" }));

  let unpaid = await t.query(api.commerceOrders.listUnpaid, {});
  expect(unpaid).toHaveLength(1);

  await t.mutation(api.commerceOrders.markPaidOut, { stripeSessionId: "cs_1", paidOutAt: "2026-01-02T00:00:00.000Z" });
  unpaid = await t.query(api.commerceOrders.listUnpaid, {});
  expect(unpaid).toHaveLength(0);

  // A refund landing AFTER payout is a clawback case — it must stay visible
  // via listRefunded even though listUnpaid has already dropped the row.
  await t.mutation(api.commerceOrders.markRefunded, { stripeSessionId: "cs_1", refundedAt: "2026-01-03T00:00:00.000Z" });
  const refunded = await t.query(api.commerceOrders.listRefunded, {});
  expect(refunded).toHaveLength(1);
  expect(refunded[0].paidOutAt).toBe("2026-01-02T00:00:00.000Z");

  // Idempotent: redelivery with a different timestamp must not move the
  // first-recorded refund time.
  await t.mutation(api.commerceOrders.markRefunded, { stripeSessionId: "cs_1", refundedAt: "2026-01-09T00:00:00.000Z" });
  const refundedAgain = await t.query(api.commerceOrders.listRefunded, {});
  expect(refundedAgain[0].refundedAt).toBe("2026-01-03T00:00:00.000Z");

  await t.mutation(api.commerceOrders.markDisputed, { stripeSessionId: "cs_1", disputedAt: "2026-01-04T00:00:00.000Z" });
  let disputed = await t.query(api.commerceOrders.listDisputed, {});
  expect(disputed).toHaveLength(1);
  // Disputing must not clear the independent refund flag.
  expect(disputed[0].refundedAt).toBe("2026-01-03T00:00:00.000Z");

  await t.mutation(api.commerceOrders.clearDisputed, { stripeSessionId: "cs_1" });
  disputed = await t.query(api.commerceOrders.listDisputed, {});
  expect(disputed).toHaveLength(0);
  const row = await t.query(api.commerceOrders.getByStripeSessionId, { stripeSessionId: "cs_1" });
  expect(row?.disputedAt).toBeUndefined();
  // Clearing the dispute must not clear the unrelated refund or paidOutAt marks.
  expect(row?.refundedAt).toBe("2026-01-03T00:00:00.000Z");
  expect(row?.paidOutAt).toBe("2026-01-02T00:00:00.000Z");
});

test("markPaidOut / markRefunded / markDisputed on an unknown stripeSessionId are safe no-ops", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.commerceOrders.markPaidOut, { stripeSessionId: "cs_missing", paidOutAt: "2026-01-01T00:00:00.000Z" }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.commerceOrders.markRefunded, { stripeSessionId: "cs_missing", refundedAt: "2026-01-01T00:00:00.000Z" }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.commerceOrders.markDisputed, { stripeSessionId: "cs_missing", disputedAt: "2026-01-01T00:00:00.000Z" }),
  ).resolves.toBeNull();
  await expect(t.mutation(api.commerceOrders.clearDisputed, { stripeSessionId: "cs_missing" })).resolves.toBeNull();

  const rows = await t.query(api.commerceOrders.list, {});
  expect(rows).toHaveLength(0);
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

  const rows: CommerceOrderRow[] = await t.query(api.commerceOrders.list, {});
  expect(rows.map((r) => r.stripeSessionId)).toEqual(["cs_b", "cs_c", "cs_a"]);
});
