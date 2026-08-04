import { describe, expect, it } from "vitest";
import {
  ConvexPrimaryWriteError,
  shouldFallbackToSqliteOnConvexFailure,
} from "./convex-primary";

describe("shouldFallbackToSqliteOnConvexFailure", () => {
  it("falls back when Convex is not configured", () => {
    expect(shouldFallbackToSqliteOnConvexFailure(false)).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(false, { requireConvex: true }),
    ).toBe(true);
  });

  it("falls back by default when Convex is configured (dashboard paths)", () => {
    expect(shouldFallbackToSqliteOnConvexFailure(true)).toBe(true);
    expect(shouldFallbackToSqliteOnConvexFailure(true, {})).toBe(true);
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, { requireConvex: false }),
    ).toBe(true);
  });

  it("does not fall back when Convex is configured and requireConvex is set", () => {
    expect(
      shouldFallbackToSqliteOnConvexFailure(true, { requireConvex: true }),
    ).toBe(false);
  });
});

describe("ConvexPrimaryWriteError", () => {
  it("names the surface and preserves the cause message", () => {
    const err = new ConvexPrimaryWriteError(
      "recordLeadPayment",
      new Error("timeout"),
    );
    expect(err.name).toBe("ConvexPrimaryWriteError");
    expect(err.surface).toBe("recordLeadPayment");
    expect(err.message).toContain("recordLeadPayment");
    expect(err.message).toContain("timeout");
    expect(err.cause).toBeInstanceOf(Error);
  });
});
