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

interface MarketingPackRow {
  id: string;
  leadSlug: string;
  yearMonth: string;
  variants: Array<{ contentType: string; title?: string; body: string; cta?: string; hashtags?: string[]; scheduledFor?: string }>;
  generatedAt: string;
  generator: "stub" | "anthropic";
  packageTier?: string;
}

function variant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    contentType: "social_caption",
    title: "Title",
    body: "Body copy",
    cta: undefined,
    hashtags: undefined,
    scheduledFor: undefined,
    ...overrides,
  };
}

function upsertArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    packId: "mp_demo-cafe_2026-01",
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    variants: [variant()],
    generatedAt: "2026-01-01T00:00:00.000Z",
    generator: "stub" as const,
    packageTier: "growth",
    apiSecret: TEST_API_SECRET,
    ...overrides,
  };
}

test("upsert inserts a new pack, then replaces (never duplicates) the same lead+month on a second call", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.marketingPacks.upsert, upsertArgs());
  await t.mutation(
    api.marketingPacks.upsert,
    upsertArgs({ packId: "mp_demo-cafe_2026-01_v2", variants: [variant({ body: "Regenerated body" })], generatedAt: "2026-01-02T00:00:00.000Z" }),
  );

  const rows = await t.query(api.marketingPacks.listByMonth, {
    yearMonth: "2026-01",
    apiSecret: TEST_API_SECRET,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("mp_demo-cafe_2026-01_v2");
  expect(rows[0].variants[0].body).toBe("Regenerated body");
});

test("upsert keeps separate rows for the same lead across different months (month-keyed, not lead-keyed)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.marketingPacks.upsert, upsertArgs({ yearMonth: "2026-01", packId: "mp_demo-cafe_2026-01" }));
  await t.mutation(api.marketingPacks.upsert, upsertArgs({ yearMonth: "2026-02", packId: "mp_demo-cafe_2026-02" }));

  const jan = await t.query(api.marketingPacks.getByLeadMonth, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    apiSecret: TEST_API_SECRET,
  });
  const feb = await t.query(api.marketingPacks.getByLeadMonth, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-02",
    apiSecret: TEST_API_SECRET,
  });
  expect(jan?.id).toBe("mp_demo-cafe_2026-01");
  expect(feb?.id).toBe("mp_demo-cafe_2026-02");
});

test("getByLeadMonth returns null for an unknown lead+month combination", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.marketingPacks.upsert, upsertArgs());

  await expect(
    t.query(api.marketingPacks.getByLeadMonth, {
      leadSlug: "demo-cafe",
      yearMonth: "2026-02",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
  await expect(
    t.query(api.marketingPacks.getByLeadMonth, {
      leadSlug: "other-lead",
      yearMonth: "2026-01",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("listByMonth scopes to the requested month and sorts newest-generatedAt-first (matches SQLite ORDER BY generatedAt DESC)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.marketingPacks.upsert,
    upsertArgs({ leadSlug: "lead-a", packId: "mp_a", generatedAt: "2026-01-01T00:00:00.000Z" }),
  );
  await t.mutation(
    api.marketingPacks.upsert,
    upsertArgs({ leadSlug: "lead-b", packId: "mp_b", generatedAt: "2026-01-03T00:00:00.000Z" }),
  );
  await t.mutation(
    api.marketingPacks.upsert,
    upsertArgs({ leadSlug: "lead-c", packId: "mp_c", generatedAt: "2026-01-02T00:00:00.000Z" }),
  );
  // Different month — must not leak into the 2026-01 listing.
  await t.mutation(
    api.marketingPacks.upsert,
    upsertArgs({ leadSlug: "lead-a", packId: "mp_a_feb", yearMonth: "2026-02", generatedAt: "2026-02-01T00:00:00.000Z" }),
  );

  const rows: MarketingPackRow[] = await t.query(api.marketingPacks.listByMonth, {
    yearMonth: "2026-01",
    apiSecret: TEST_API_SECRET,
  });
  expect(rows.map((r) => r.id)).toEqual(["mp_b", "mp_c", "mp_a"]);
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.marketingPacks.upsert, upsertArgs({ apiSecret: "wrong" })),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.marketingPacks.getByLeadMonth, {
      leadSlug: "demo-cafe",
      yearMonth: "2026-01",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.marketingPacks.listByMonth, { yearMonth: "2026-01", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});

test("markSentToClient marks an unsent pack and returns true", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.marketingPacks.upsert, upsertArgs());

  const marked = await t.mutation(api.marketingPacks.markSentToClient, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    sentToClientAt: "2026-01-05T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(marked).toBe(true);

  const row = await t.query(api.marketingPacks.getByLeadMonth, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.sentToClientAt).toBe("2026-01-05T00:00:00.000Z");
});

test("markSentToClient is a no-op once already marked, and returns false for an unknown pack", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.marketingPacks.upsert, upsertArgs());
  await t.mutation(api.marketingPacks.markSentToClient, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    sentToClientAt: "2026-01-05T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  const secondMark = await t.mutation(api.marketingPacks.markSentToClient, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    sentToClientAt: "2026-01-06T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(secondMark).toBe(false);
  const row = await t.query(api.marketingPacks.getByLeadMonth, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.sentToClientAt).toBe("2026-01-05T00:00:00.000Z");

  const missing = await t.mutation(api.marketingPacks.markSentToClient, {
    leadSlug: "no-such-lead",
    yearMonth: "2026-01",
    sentToClientAt: "2026-01-06T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(missing).toBe(false);
});

test("upsert (regenerate) clears a previously-set sentToClientAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.marketingPacks.upsert, upsertArgs());
  await t.mutation(api.marketingPacks.markSentToClient, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    sentToClientAt: "2026-01-05T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  await t.mutation(
    api.marketingPacks.upsert,
    upsertArgs({ packId: "mp_demo-cafe_2026-01_v2", generatedAt: "2026-01-10T00:00:00.000Z" }),
  );

  const row = await t.query(api.marketingPacks.getByLeadMonth, {
    leadSlug: "demo-cafe",
    yearMonth: "2026-01",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.sentToClientAt).toBeUndefined();
});
