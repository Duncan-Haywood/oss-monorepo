import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { DEPLOY_HANDOFF_CONVEX_PRIMARY } from "./handoff-persist";

describe("DEPLOY_HANDOFF_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(DEPLOY_HANDOFF_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, DEPLOY_HANDOFF_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, DEPLOY_HANDOFF_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
