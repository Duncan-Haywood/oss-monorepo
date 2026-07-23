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

interface ClientVoicePackRow {
  id: string;
  leadSlug: string;
  variants: Array<{ scriptType: string; title: string; body: string; cta?: string }>;
  generatedAt: string;
  generator: "stub" | "anthropic";
}

function variant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    scriptType: "greeting",
    title: "Greeting",
    body: "Thanks for calling!",
    cta: undefined,
    ...overrides,
  };
}

function upsertArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    packId: "cvp_demo-cafe",
    leadSlug: "demo-cafe",
    variants: [variant()],
    generatedAt: "2026-01-01T00:00:00.000Z",
    generator: "stub" as const,
    apiSecret: TEST_API_SECRET,
    ...overrides,
  };
}

test("upsert inserts a new pack, then replaces (never duplicates) the same lead on a second call", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs());
  await t.mutation(
    api.clientVoicePacks.upsert,
    upsertArgs({ packId: "cvp_demo-cafe_v2", variants: [variant({ body: "Regenerated greeting" })], generatedAt: "2026-01-02T00:00:00.000Z" }),
  );

  const rows: ClientVoicePackRow[] = await t.query(api.clientVoicePacks.list, {
    apiSecret: TEST_API_SECRET,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("cvp_demo-cafe_v2");
  expect(rows[0].variants[0].body).toBe("Regenerated greeting");
});

test("getByLeadSlug returns null for a lead with no pack, and the stored pack otherwise", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs());

  await expect(
    t.query(api.clientVoicePacks.getByLeadSlug, {
      leadSlug: "no-such-lead",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
  const found = await t.query(api.clientVoicePacks.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.id).toBe("cvp_demo-cafe");
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.clientVoicePacks.upsert, upsertArgs({ apiSecret: "wrong" })),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.clientVoicePacks.getByLeadSlug, { leadSlug: "demo-cafe", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.clientVoicePacks.list, { apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});

test("upsert keeps one row per lead — not scoped by any other key (unlike marketing packs, which are month-keyed)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs({ leadSlug: "lead-a", packId: "cvp_a" }));
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs({ leadSlug: "lead-b", packId: "cvp_b" }));

  const rows: ClientVoicePackRow[] = await t.query(api.clientVoicePacks.list, {
    apiSecret: TEST_API_SECRET,
  });
  expect(rows.map((r) => r.leadSlug).sort()).toEqual(["lead-a", "lead-b"]);
});

test("list sorts newest-generatedAt-first (matches SQLite ORDER BY generatedAt DESC)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.clientVoicePacks.upsert,
    upsertArgs({ leadSlug: "lead-a", packId: "cvp_a", generatedAt: "2026-01-01T00:00:00.000Z" }),
  );
  await t.mutation(
    api.clientVoicePacks.upsert,
    upsertArgs({ leadSlug: "lead-b", packId: "cvp_b", generatedAt: "2026-01-03T00:00:00.000Z" }),
  );
  await t.mutation(
    api.clientVoicePacks.upsert,
    upsertArgs({ leadSlug: "lead-c", packId: "cvp_c", generatedAt: "2026-01-02T00:00:00.000Z" }),
  );

  const rows: ClientVoicePackRow[] = await t.query(api.clientVoicePacks.list, {
    apiSecret: TEST_API_SECRET,
  });
  expect(rows.map((r) => r.id)).toEqual(["cvp_b", "cvp_c", "cvp_a"]);
});

test("markSentToClient marks an unsent pack and returns true", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs());

  const marked = await t.mutation(api.clientVoicePacks.markSentToClient, {
    leadSlug: "demo-cafe",
    sentToClientAt: "2026-01-05T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(marked).toBe(true);

  const row = await t.query(api.clientVoicePacks.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.sentToClientAt).toBe("2026-01-05T00:00:00.000Z");
});

test("markSentToClient is a no-op once already marked, and returns false for an unknown lead", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs());
  await t.mutation(api.clientVoicePacks.markSentToClient, {
    leadSlug: "demo-cafe",
    sentToClientAt: "2026-01-05T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  const secondMark = await t.mutation(api.clientVoicePacks.markSentToClient, {
    leadSlug: "demo-cafe",
    sentToClientAt: "2026-01-06T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(secondMark).toBe(false);
  const row = await t.query(api.clientVoicePacks.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.sentToClientAt).toBe("2026-01-05T00:00:00.000Z");

  const missing = await t.mutation(api.clientVoicePacks.markSentToClient, {
    leadSlug: "no-such-lead",
    sentToClientAt: "2026-01-06T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(missing).toBe(false);
});

test("upsert (regenerate) clears a previously-set sentToClientAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs());
  await t.mutation(api.clientVoicePacks.markSentToClient, {
    leadSlug: "demo-cafe",
    sentToClientAt: "2026-01-05T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  await t.mutation(
    api.clientVoicePacks.upsert,
    upsertArgs({ packId: "cvp_demo-cafe_v2", generatedAt: "2026-01-10T00:00:00.000Z" }),
  );

  const row = await t.query(api.clientVoicePacks.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.sentToClientAt).toBeUndefined();
});
