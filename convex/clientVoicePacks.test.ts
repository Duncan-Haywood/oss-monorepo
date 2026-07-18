import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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

  const rows: ClientVoicePackRow[] = await t.query(api.clientVoicePacks.list, {});
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("cvp_demo-cafe_v2");
  expect(rows[0].variants[0].body).toBe("Regenerated greeting");
});

test("getByLeadSlug returns null for a lead with no pack, and the stored pack otherwise", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs());

  await expect(t.query(api.clientVoicePacks.getByLeadSlug, { leadSlug: "no-such-lead" })).resolves.toBeNull();
  const found = await t.query(api.clientVoicePacks.getByLeadSlug, { leadSlug: "demo-cafe" });
  expect(found?.id).toBe("cvp_demo-cafe");
});

test("upsert keeps one row per lead — not scoped by any other key (unlike marketing packs, which are month-keyed)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs({ leadSlug: "lead-a", packId: "cvp_a" }));
  await t.mutation(api.clientVoicePacks.upsert, upsertArgs({ leadSlug: "lead-b", packId: "cvp_b" }));

  const rows: ClientVoicePackRow[] = await t.query(api.clientVoicePacks.list, {});
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

  const rows: ClientVoicePackRow[] = await t.query(api.clientVoicePacks.list, {});
  expect(rows.map((r) => r.id)).toEqual(["cvp_b", "cvp_c", "cvp_a"]);
});
