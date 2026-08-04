import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { OUTREACH_CADENCE_CONVEX_PRIMARY } from "./outreach-persist";

describe("OUTREACH_CADENCE_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(OUTREACH_CADENCE_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, OUTREACH_CADENCE_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, OUTREACH_CADENCE_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
