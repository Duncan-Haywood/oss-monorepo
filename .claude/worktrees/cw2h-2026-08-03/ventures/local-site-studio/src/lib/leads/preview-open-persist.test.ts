import { describe, expect, it } from "vitest";
import { PREVIEW_OPEN_CONVEX_PRIMARY } from "./preview-open-persist";

describe("PREVIEW_OPEN_CONVEX_PRIMARY", () => {
  it("requires Convex when configured (no SQLite-only preview-open success)", () => {
    expect(PREVIEW_OPEN_CONVEX_PRIMARY.requireConvex).toBe(true);
  });
});
