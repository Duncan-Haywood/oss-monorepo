import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import {
  LEAD_STRIPE_CONNECT_CONVEX_PRIMARY,
  LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY,
} from "./stripe-connect-persist";

describe("LEAD_STRIPE_CONNECT_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(LEAD_STRIPE_CONNECT_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, LEAD_STRIPE_CONNECT_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, LEAD_STRIPE_CONNECT_CONVEX_PRIMARY),
    ).toBe(true);
  });
});

describe("LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
