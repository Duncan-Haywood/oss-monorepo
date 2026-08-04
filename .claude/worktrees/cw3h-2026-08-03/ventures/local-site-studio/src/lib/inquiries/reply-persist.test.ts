import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { INQUIRY_REPLY_CONVEX_PRIMARY } from "./reply-persist";

describe("INQUIRY_REPLY_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(INQUIRY_REPLY_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, INQUIRY_REPLY_CONVEX_PRIMARY),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, INQUIRY_REPLY_CONVEX_PRIMARY),
    ).toBe(true);
  });
});
