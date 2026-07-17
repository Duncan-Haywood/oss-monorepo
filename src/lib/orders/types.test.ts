import { describe, expect, it } from "vitest";
import { isOrderRefunded, sortOrdersNewestFirst } from "./types";

describe("isOrderRefunded", () => {
  it("is false when refundedAt is absent", () => {
    expect(isOrderRefunded({})).toBe(false);
  });

  it("is true when refundedAt is set", () => {
    expect(isOrderRefunded({ refundedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("sortOrdersNewestFirst", () => {
  it("orders by createdAt descending without mutating input", () => {
    const input = [
      { id: "old", createdAt: "2026-07-01T00:00:00.000Z" },
      { id: "new", createdAt: "2026-07-12T00:00:00.000Z" },
      { id: "mid", createdAt: "2026-07-06T00:00:00.000Z" },
    ];
    const sorted = sortOrdersNewestFirst(input);
    expect(sorted.map((o) => o.id)).toEqual(["new", "mid", "old"]);
    expect(input[0]?.id).toBe("old");
  });
});
