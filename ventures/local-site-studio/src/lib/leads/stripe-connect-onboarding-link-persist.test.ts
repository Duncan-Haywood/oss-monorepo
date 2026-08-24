import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY } from "./stripe-connect-onboarding-link-persist";

describe("STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(
      STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY.requireConvex,
    ).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        true,
        STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY,
      ),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        false,
        STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY,
      ),
    ).toBe(true);
  });
});
