import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "./session-persist";

describe("CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    // When convexClient is null, recordCheckoutSessionCreated writes SQLite
    // directly; shouldFallback reports true so callers that check the helper
    // treat SQLite as the primary store.
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
