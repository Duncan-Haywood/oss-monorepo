import { describe, expect, it } from "vitest";
import { shouldFallbackToSqliteOnConvexFailure } from "@/lib/payments/convex-primary";
import { CLIENT_VOICE_PACK_CONVEX_PRIMARY } from "./pack-persist";

describe("CLIENT_VOICE_PACK_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite fallback)", () => {
    expect(CLIENT_VOICE_PACK_CONVEX_PRIMARY.requireConvex).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        true,
        CLIENT_VOICE_PACK_CONVEX_PRIMARY,
      ),
    ).toBe(false);
  });

  it("still allows SQLite when Convex is not configured", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(
        false,
        CLIENT_VOICE_PACK_CONVEX_PRIMARY,
      ),
    ).toBe(true);
  });
});
