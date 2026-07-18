import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

interface CheckoutSessionRow {
  leadSlug: string;
  stripeSessionId: string;
  status: string;
  createdAt: string;
  kind?: string;
  skuId?: string;
  customerEmail?: string;
  recoverySentAt?: string;
}

function createArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    leadSlug: "demo-cafe",
    stripeSessionId: "cs_test_1",
    tier: "growth",
    commerceAddon: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("create is idempotent on stripeSessionId and inserts new rows with status open", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.checkoutSessions.create, createArgs());
  // Redelivery / repeat checkout-create call must not insert a second row.
  await t.mutation(api.checkoutSessions.create, createArgs());

  const rows: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("open");
});

test("markComplete / markOpen round-trip a session's status and are safe no-ops on an unknown stripeSessionId", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_1" }));

  await t.mutation(api.checkoutSessions.markComplete, { stripeSessionId: "cs_1" });
  let open: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  expect(open).toHaveLength(0);

  // async_payment_failed must reopen a completed session so abandoned-recovery
  // can nudge a retry.
  await t.mutation(api.checkoutSessions.markOpen, { stripeSessionId: "cs_1" });
  open = await t.query(api.checkoutSessions.listOpen, {});
  expect(open).toHaveLength(1);

  await expect(t.mutation(api.checkoutSessions.markComplete, { stripeSessionId: "cs_missing" })).resolves.toBeNull();
  await expect(t.mutation(api.checkoutSessions.markOpen, { stripeSessionId: "cs_missing" })).resolves.toBeNull();
});

test("markCompleteOpenBundleForLead closes sibling open bundle rows for the lead but never touches commerce_sku rows", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_paid", kind: "bundle" }));
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_orphan_bundle", kind: "bundle" }));
  await t.mutation(
    api.checkoutSessions.create,
    createArgs({ stripeSessionId: "cs_commerce", kind: "commerce_sku", skuId: "sku_1", customerEmail: "a@b.com" }),
  );

  const closed = await t.mutation(api.checkoutSessions.markCompleteOpenBundleForLead, {
    leadSlug: "demo-cafe",
    exceptStripeSessionId: "cs_paid",
  });
  expect(closed).toBe(1);

  const open: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  const openIds = open.map((r) => r.stripeSessionId);
  // The just-paid session and the untouched commerce_sku row both stay open;
  // only the sibling bundle cart closes.
  expect(openIds).toContain("cs_paid");
  expect(openIds).toContain("cs_commerce");
  expect(openIds).not.toContain("cs_orphan_bundle");
});

test("markCompleteOpenBundleForLead allowlists bundle-like kind and leaves an unrecognized kind value open, matching the SQLite fallback's WHERE clause", async () => {
  const t = convexTest(schema, modules);
  // The checkoutSessions table stores kind as a loose v.optional(v.string())
  // (schema.ts), not the closed "bundle" | "commerce_sku" union `create`
  // validates — insert an out-of-union value directly to simulate a stray
  // row a future kind or a bypassed write path could produce.
  await t.run(async (ctx) => {
    await ctx.db.insert("checkoutSessions", {
      leadSlug: "demo-cafe",
      stripeSessionId: "cs_unknown_kind",
      tier: "",
      commerceAddon: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      kind: "future_kind",
      status: "open",
    });
  });
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_paid" }));

  const closed = await t.mutation(api.checkoutSessions.markCompleteOpenBundleForLead, {
    leadSlug: "demo-cafe",
    exceptStripeSessionId: "cs_paid",
  });
  expect(closed).toBe(0);

  const open: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  expect(open.map((r) => r.stripeSessionId)).toContain("cs_unknown_kind");
});

test("markCompleteOpenCommerceForLeadSkuCustomer closes only matching sku+email siblings, case/whitespace-insensitively, and ignores blank email", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.checkoutSessions.create,
    createArgs({ stripeSessionId: "cs_paid", kind: "commerce_sku", skuId: "sku_1", customerEmail: "Buyer@Example.com" }),
  );
  await t.mutation(
    api.checkoutSessions.create,
    createArgs({ stripeSessionId: "cs_same_shopper", kind: "commerce_sku", skuId: "sku_1", customerEmail: " buyer@example.com " }),
  );
  await t.mutation(
    api.checkoutSessions.create,
    createArgs({ stripeSessionId: "cs_other_shopper", kind: "commerce_sku", skuId: "sku_1", customerEmail: "other@example.com" }),
  );
  await t.mutation(
    api.checkoutSessions.create,
    createArgs({ stripeSessionId: "cs_blank_email", kind: "commerce_sku", skuId: "sku_1", customerEmail: "" }),
  );

  const closed = await t.mutation(api.checkoutSessions.markCompleteOpenCommerceForLeadSkuCustomer, {
    leadSlug: "demo-cafe",
    skuId: "sku_1",
    customerEmail: "buyer@example.com",
    exceptStripeSessionId: "cs_paid",
  });
  expect(closed).toBe(1);

  const open: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  const openIds = open.map((r) => r.stripeSessionId);
  expect(openIds).toContain("cs_paid");
  expect(openIds).toContain("cs_other_shopper");
  expect(openIds).toContain("cs_blank_email");
  expect(openIds).not.toContain("cs_same_shopper");
});

test("recordRecoverySent stamps recoverySentAt on a known session and is a safe no-op on an unknown one", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_1" }));

  await expect(
    t.mutation(api.checkoutSessions.recordRecoverySent, { stripeSessionId: "cs_missing", sentAt: "2026-01-05T00:00:00.000Z" }),
  ).resolves.toBeNull();

  await t.mutation(api.checkoutSessions.recordRecoverySent, { stripeSessionId: "cs_1", sentAt: "2026-01-05T00:00:00.000Z" });
  const rows: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  expect(rows[0].recoverySentAt).toBe("2026-01-05T00:00:00.000Z");
});

test("listOpen returns only open sessions, sorted oldest-createdAt-first (matches SQLite ORDER BY createdAt ASC)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_b", createdAt: "2026-01-03T00:00:00.000Z" }));
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_a", createdAt: "2026-01-01T00:00:00.000Z" }));
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_c", createdAt: "2026-01-02T00:00:00.000Z" }));
  await t.mutation(api.checkoutSessions.create, createArgs({ stripeSessionId: "cs_already_done", createdAt: "2026-01-04T00:00:00.000Z" }));
  await t.mutation(api.checkoutSessions.markComplete, { stripeSessionId: "cs_already_done" });

  const rows: CheckoutSessionRow[] = await t.query(api.checkoutSessions.listOpen, {});
  expect(rows.map((r) => r.stripeSessionId)).toEqual(["cs_a", "cs_c", "cs_b"]);
});
