import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("isSuppressed is false for an unknown email and true once suppress has run", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.suppressions.isSuppressed, { email: "buyer@example.com" })).toBe(false);

  await t.mutation(api.suppressions.suppress, { email: "buyer@example.com" });
  expect(await t.query(api.suppressions.isSuppressed, { email: "buyer@example.com" })).toBe(true);
});

test("suppress is idempotent — a repeat call for the same email does not insert a duplicate row", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, { email: "buyer@example.com" });
  await t.mutation(api.suppressions.suppress, { email: "buyer@example.com" });

  const rows: string[] = await t.query(api.suppressions.list, {});
  expect(rows).toEqual(["buyer@example.com"]);
});

test("list returns every suppressed email", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.suppressions.suppress, { email: "a@example.com" });
  await t.mutation(api.suppressions.suppress, { email: "b@example.com" });

  const rows: string[] = await t.query(api.suppressions.list, {});
  expect(rows.sort()).toEqual(["a@example.com", "b@example.com"]);
});
