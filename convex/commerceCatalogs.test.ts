import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

interface CommerceCatalogRow {
  leadSlug: string;
  items: Array<{ id: string; name: string; description?: string; priceCents: number; stripeProductId?: string; stripePriceId?: string }>;
  updatedAt: string;
}

function sku(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sku_1",
    name: "Widget",
    description: undefined,
    priceCents: 1999,
    stripeProductId: undefined,
    stripePriceId: undefined,
    ...overrides,
  };
}

function upsertArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    leadSlug: "demo-cafe",
    items: [sku()],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("upsert inserts a new catalog, then replaces the whole item list (never duplicates) on a second call for the same lead", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceCatalogs.upsert, upsertArgs());
  await t.mutation(
    api.commerceCatalogs.upsert,
    upsertArgs({ items: [sku({ id: "sku_2", name: "Gadget" })], updatedAt: "2026-01-02T00:00:00.000Z" }),
  );

  const rows: CommerceCatalogRow[] = await t.query(api.commerceCatalogs.list, {});
  expect(rows).toHaveLength(1);
  expect(rows[0].items).toHaveLength(1);
  expect(rows[0].items[0].id).toBe("sku_2");
  expect(rows[0].updatedAt).toBe("2026-01-02T00:00:00.000Z");
});

test("upsert preserves stripeProductId/stripePriceId when the caller round-trips them (sync-to-Stripe survives a later edit)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.commerceCatalogs.upsert,
    upsertArgs({ items: [sku({ stripeProductId: "prod_1", stripePriceId: "price_1" })] }),
  );

  const stored = await t.query(api.commerceCatalogs.getByLeadSlug, { leadSlug: "demo-cafe" });
  expect(stored?.items[0].stripeProductId).toBe("prod_1");
  expect(stored?.items[0].stripePriceId).toBe("price_1");
});

test("getByLeadSlug returns null for a lead with no catalog, and the stored catalog otherwise", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceCatalogs.upsert, upsertArgs());

  await expect(t.query(api.commerceCatalogs.getByLeadSlug, { leadSlug: "no-such-lead" })).resolves.toBeNull();
  const found = await t.query(api.commerceCatalogs.getByLeadSlug, { leadSlug: "demo-cafe" });
  expect(found?.leadSlug).toBe("demo-cafe");
});

test("list keeps one row per lead and sorts newest-updatedAt-first (matches SQLite ORDER BY updatedAt DESC)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.commerceCatalogs.upsert, upsertArgs({ leadSlug: "lead-a", updatedAt: "2026-01-01T00:00:00.000Z" }));
  await t.mutation(api.commerceCatalogs.upsert, upsertArgs({ leadSlug: "lead-b", updatedAt: "2026-01-03T00:00:00.000Z" }));
  await t.mutation(api.commerceCatalogs.upsert, upsertArgs({ leadSlug: "lead-c", updatedAt: "2026-01-02T00:00:00.000Z" }));

  const rows: CommerceCatalogRow[] = await t.query(api.commerceCatalogs.list, {});
  expect(rows.map((r) => r.leadSlug)).toEqual(["lead-b", "lead-c", "lead-a"]);
});
