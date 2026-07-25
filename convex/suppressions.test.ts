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

test("isSuppressed is false for an unknown email and true once suppress has run", async () => {
  const t = convexTest(schema, modules);
  expect(
    await t.query(api.suppressions.isSuppressed, {
      email: "buyer@example.com",
      apiSecret: TEST_API_SECRET,
    }),
  ).toBe(false);

  await t.mutation(api.suppressions.suppress, {
    email: "buyer@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  expect(
    await t.query(api.suppressions.isSuppressed, {
      email: "buyer@example.com",
      apiSecret: TEST_API_SECRET,
    }),
  ).toBe(true);
});

test("suppress is idempotent — a repeat call for the same email does not insert a duplicate row", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "buyer@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "buyer@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r: { email: string }) => r.email)).toEqual(["buyer@example.com"]);
});

test("suppress records the reason, and a repeat call does not overwrite it", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "bounced@example.com",
    reason: "bounce",
    apiSecret: TEST_API_SECRET,
  });
  // A later unsubscribe click for an address that already hard-bounced must
  // not downgrade the reason back to "unsubscribe" — the existing-row check
  // in the mutation already guards this, this pins it as a regression test.
  await t.mutation(api.suppressions.suppress, {
    email: "bounced@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual([
    expect.objectContaining({ email: "bounced@example.com", reason: "bounce" }),
  ]);
});

test("suppress upgrades an existing unsubscribe row to a later bounce or complaint", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "later-bounces@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  // A later hard bounce for an address that only routinely unsubscribed
  // before must upgrade the stored reason — silently no-op'ing this (the
  // original bug) discarded a real sender-reputation signal and left the
  // dashboard panel mislabeling the row as a low-risk opt-out.
  await t.mutation(api.suppressions.suppress, {
    email: "later-bounces@example.com",
    reason: "bounce",
    apiSecret: TEST_API_SECRET,
  });

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual([
    expect.objectContaining({ email: "later-bounces@example.com", reason: "bounce" }),
  ]);
});

test("suppress upgrades an existing bounce row to a later complaint", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "escalates@example.com",
    reason: "bounce",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "escalates@example.com",
    reason: "complaint",
    apiSecret: TEST_API_SECRET,
  });

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual([
    expect.objectContaining({ email: "escalates@example.com", reason: "complaint" }),
  ]);
});

test("suppress records reasonUpdatedAt on an upgrade, but leaves it unset on insert or a same-reason repeat call", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "later-bounces@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  const afterInsert = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(afterInsert[0].reasonUpdatedAt).toBeUndefined();

  // A same-reason repeat call must not fabricate an upgrade timestamp — the
  // reason didn't actually change, so reasonUpdatedAt must stay unset.
  await t.mutation(api.suppressions.suppress, {
    email: "later-bounces@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  const afterRepeat = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(afterRepeat[0].reasonUpdatedAt).toBeUndefined();

  // A real upgrade (unsubscribe -> bounce) must stamp reasonUpdatedAt — this
  // is the recency signal the pipeline-health/digest bounce/complaint
  // windows read, since Convex's own _creationTime (createdAt) is immutable
  // and would otherwise still reflect the original unsubscribe click.
  await t.mutation(api.suppressions.suppress, {
    email: "later-bounces@example.com",
    reason: "bounce",
    apiSecret: TEST_API_SECRET,
  });
  const afterUpgrade = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(afterUpgrade[0].reason).toBe("bounce");
  expect(typeof afterUpgrade[0].reasonUpdatedAt).toBe("number");
  expect(afterUpgrade[0].reasonUpdatedAt).toBeGreaterThanOrEqual(afterUpgrade[0].createdAt);
});

test("list returns every suppressed email with its reason and createdAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "a@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "b@example.com",
    reason: "complaint",
    apiSecret: TEST_API_SECRET,
  });

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  const sorted = [...rows].sort((r1, r2) => r1.email.localeCompare(r2.email));
  expect(sorted).toEqual([
    expect.objectContaining({ email: "a@example.com", reason: "unsubscribe" }),
    expect.objectContaining({ email: "b@example.com", reason: "complaint" }),
  ]);
  for (const row of sorted) {
    expect(typeof row.createdAt).toBe("number");
  }
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.suppressions.isSuppressed, { email: "x@example.com", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.suppressions.suppress, {
      email: "x@example.com",
      reason: "unsubscribe",
      apiSecret: "wrong",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.suppressions.list, { apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});

test("every function rejects any caller (even a correct-looking guess) when CONVEX_API_SECRET is unset", async () => {
  delete process.env.CONVEX_API_SECRET;
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.suppressions.isSuppressed, { email: "x@example.com", apiSecret: "" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.suppressions.suppress, {
      email: "x@example.com",
      reason: "unsubscribe",
      apiSecret: "",
    }),
  ).rejects.toThrow(/Unauthorized/);
});

test("unsuppress removes a suppressed email and reports true", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "buyer@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });

  const removed = await t.mutation(api.suppressions.unsuppress, {
    email: "buyer@example.com",
    apiSecret: TEST_API_SECRET,
  });
  expect(removed).toBe(true);
  expect(
    await t.query(api.suppressions.isSuppressed, {
      email: "buyer@example.com",
      apiSecret: TEST_API_SECRET,
    }),
  ).toBe(false);
});

test("unsuppress on an address that was never suppressed reports false and stays a no-op", async () => {
  const t = convexTest(schema, modules);
  const removed = await t.mutation(api.suppressions.unsuppress, {
    email: "never-suppressed@example.com",
    apiSecret: TEST_API_SECRET,
  });
  expect(removed).toBe(false);

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual([]);
});

test("unsuppress only removes the matching row, leaving sibling suppressions intact", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "a@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "b@example.com",
    reason: "unsubscribe",
    apiSecret: TEST_API_SECRET,
  });

  await t.mutation(api.suppressions.unsuppress, {
    email: "a@example.com",
    apiSecret: TEST_API_SECRET,
  });

  const rows = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r: { email: string }) => r.email)).toEqual(["b@example.com"]);
});

test("unsuppress rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.suppressions.unsuppress, { email: "x@example.com", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});
