import { describe, expect, it } from "vitest";
import {
  isOrderDisputed,
  isOrderRefunded,
  orderCountsTowardRevenue,
  sortOrdersNewestFirst,
} from "./types";

describe("isOrderRefunded", () => {
  it("is false when refundedAt is absent", () => {
    expect(isOrderRefunded({})).toBe(false);
  });

  it("is true when refundedAt is set", () => {
    expect(isOrderRefunded({ refundedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("isOrderDisputed", () => {
  it("is false when disputedAt is absent", () => {
    expect(isOrderDisputed({})).toBe(false);
  });

  it("is true when disputedAt is set", () => {
    expect(isOrderDisputed({ disputedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("orderCountsTowardRevenue", () => {
  it("is true when neither refunded nor disputed", () => {
    expect(orderCountsTowardRevenue({})).toBe(true);
  });

  it("is false when refunded", () => {
    expect(orderCountsTowardRevenue({ refundedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("is false when disputed", () => {
    expect(orderCountsTowardRevenue({ disputedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
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
