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
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "buyer@example.com",
    apiSecret: TEST_API_SECRET,
  });

  const rows: string[] = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual(["buyer@example.com"]);
});

test("list returns every suppressed email", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "a@example.com",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "b@example.com",
    apiSecret: TEST_API_SECRET,
  });

  const rows: string[] = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows.sort()).toEqual(["a@example.com", "b@example.com"]);
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.suppressions.isSuppressed, { email: "x@example.com", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.suppressions.suppress, { email: "x@example.com", apiSecret: "wrong" }),
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
    t.mutation(api.suppressions.suppress, { email: "x@example.com", apiSecret: "" }),
  ).rejects.toThrow(/Unauthorized/);
});

test("unsuppress removes a suppressed email and reports true", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "buyer@example.com",
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

  const rows: string[] = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual([]);
});

test("unsuppress only removes the matching row, leaving sibling suppressions intact", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, {
    email: "a@example.com",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.suppressions.suppress, {
    email: "b@example.com",
    apiSecret: TEST_API_SECRET,
  });

  await t.mutation(api.suppressions.unsuppress, {
    email: "a@example.com",
    apiSecret: TEST_API_SECRET,
  });

  const rows: string[] = await t.query(api.suppressions.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toEqual(["b@example.com"]);
});

test("unsuppress rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.suppressions.unsuppress, { email: "x@example.com", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});
