import { describe, expect, it } from "vitest";
import { UNSUBSCRIBE_CONVEX_PRIMARY } from "./suppression-persist";

describe("UNSUBSCRIBE_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite-only unsubscribe success)", () => {
    expect(UNSUBSCRIBE_CONVEX_PRIMARY.requireConvex).toBe(true);
  });
});
