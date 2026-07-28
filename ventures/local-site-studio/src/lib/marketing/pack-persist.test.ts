import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { MARKETING_PACK_CONVEX_PRIMARY } from "./pack-persist";

describe("MARKETING_PACK_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(MARKETING_PACK_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, MARKETING_PACK_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, MARKETING_PACK_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
