import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { COLD_DISPOSITION_CONVEX_PRIMARY } from "./cold-disposition-persist";

describe("COLD_DISPOSITION_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(COLD_DISPOSITION_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        true,
        COLD_DISPOSITION_CONVEX_PRIMARY,
      ),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        false,
        COLD_DISPOSITION_CONVEX_PRIMARY,
      ),
    ).toBe(true);
  });
});
