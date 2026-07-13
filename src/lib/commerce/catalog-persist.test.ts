import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { COMMERCE_CATALOG_CONVEX_PRIMARY } from "./catalog-persist";

describe("COMMERCE_CATALOG_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(COMMERCE_CATALOG_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, COMMERCE_CATALOG_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, COMMERCE_CATALOG_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
