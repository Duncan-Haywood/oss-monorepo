import { describe, expect, it } from "vitest";
import {
  OPERATOR_UNSUPPRESS_CONVEX_PRIMARY,
  UNSUBSCRIBE_CONVEX_PRIMARY,
} from "./suppression-persist";

describe("UNSUBSCRIBE_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite-only unsubscribe success)", () => {
    expect(UNSUBSCRIBE_CONVEX_PRIMARY.requireConvex).toBe(true);
  });
});

describe("OPERATOR_UNSUPPRESS_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite-only unsuppress success)", () => {
    expect(OPERATOR_UNSUPPRESS_CONVEX_PRIMARY.requireConvex).toBe(true);
  });
});
