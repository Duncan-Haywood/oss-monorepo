import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { GROWTH_UPSELL_SENT_CONVEX_PRIMARY } from "./growth-upsell-persist";

describe("GROWTH_UPSELL_SENT_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(GROWTH_UPSELL_SENT_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        true,
        GROWTH_UPSELL_SENT_CONVEX_PRIMARY,
      ),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        false,
        GROWTH_UPSELL_SENT_CONVEX_PRIMARY,
      ),
    ).toBe(true);
  });
});
