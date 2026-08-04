import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { COMMERCE_PAID_OUT_CONVEX_PRIMARY } from "./paid-out-persist";

describe("COMMERCE_PAID_OUT_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(COMMERCE_PAID_OUT_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, COMMERCE_PAID_OUT_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, COMMERCE_PAID_OUT_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
