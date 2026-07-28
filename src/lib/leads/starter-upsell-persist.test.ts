import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { STARTER_UPSELL_SENT_CONVEX_PRIMARY } from "./starter-upsell-persist";

describe("STARTER_UPSELL_SENT_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(STARTER_UPSELL_SENT_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        true,
        STARTER_UPSELL_SENT_CONVEX_PRIMARY,
      ),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        false,
        STARTER_UPSELL_SENT_CONVEX_PRIMARY,
      ),
    ).toBe(true);
  });
});
