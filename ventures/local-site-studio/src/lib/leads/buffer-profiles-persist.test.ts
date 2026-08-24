import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { LEAD_BUFFER_PROFILES_CONVEX_PRIMARY } from "./buffer-profiles-persist";

describe("LEAD_BUFFER_PROFILES_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(LEAD_BUFFER_PROFILES_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, LEAD_BUFFER_PROFILES_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, LEAD_BUFFER_PROFILES_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
